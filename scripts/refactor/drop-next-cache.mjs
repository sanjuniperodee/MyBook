// Разовый кодмод (docs/refactor/legacy-removal-plan.md, этап 1): убрать из src/server сброс кэша страниц Next
// (revalidatePath/revalidateTag — у бэкенда без Next прокладка пустая) и директиву "use server".
// Работает по синтаксическому дереву TypeScript: удаляет только операторы-вызовы и `if (простое условие) вызов;`,
// всё остальное, где встречаются эти имена, печатает — его правят руками.
// Запуск: node scripts/refactor/drop-next-cache.mjs [--write]
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const WRITE = process.argv.includes("--write");
// --names a,b — второй проход: обёртки, которые после первого стали пустыми (их объявления тоже удаляются).
const namesArg = process.argv.find((a) => a.startsWith("--names="));
const NAMES = new Set(namesArg ? namesArg.slice(8).split(",") : ["revalidatePath", "revalidateTag", "updateTag"]);

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

const isDropCall = (node) =>
  ts.isExpressionStatement(node) &&
  ts.isCallExpression(node.expression) &&
  ts.isIdentifier(node.expression.expression) &&
  NAMES.has(node.expression.expression.text);

/** Условие без побочных эффектов: имя, a.b.c, !имя, a.b === c и т. п. */
const pureCondition = (e) =>
  ts.isIdentifier(e) ||
  (ts.isPropertyAccessExpression(e) && pureCondition(e.expression)) ||
  (ts.isPrefixUnaryExpression(e) && pureCondition(e.operand)) ||
  (ts.isParenthesizedExpression(e) && pureCondition(e.expression)) ||
  e.kind === ts.SyntaxKind.ThisKeyword;

let changed = 0;
const leftovers = [];
for (const file of walk("src/server")) {
  const src = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const cuts = []; // [start, end] — с ведущими пробелами строки и переводом строки
  const cutLine = (node) => {
    let start = node.getStart(sf);
    let end = node.getEnd();
    while (start > 0 && (src[start - 1] === " " || src[start - 1] === "\t")) start--;
    if (src[end] === "\n") end++;
    cuts.push([start, end]);
  };

  // "use server" — первая директива файла
  const first = sf.statements[0];
  if (first && ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression) && first.expression.text === "use server") cutLine(first);

  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === "next/cache") {
      const named = node.importClause?.namedBindings;
      const all = named && ts.isNamedImports(named) ? named.elements.map((e) => e.name.text) : [];
      if (all.every((n) => NAMES.has(n))) cutLine(node);
      else leftovers.push(`${file}: import из next/cache c ${all.join(", ")}`);
      return;
    }
    if (isDropCall(node)) return cutLine(node);
    if (ts.isFunctionDeclaration(node) && node.name && NAMES.has(node.name.text) && node.body && node.body.statements.length === 0) return cutLine(node);
    if (ts.isIfStatement(node) && !node.elseStatement && isDropCall(node.thenStatement) && pureCondition(node.expression)) return cutLine(node);
    if (ts.isIdentifier(node) && NAMES.has(node.text)) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      leftovers.push(`${file}:${line + 1}: ${src.split("\n")[line].trim()}`);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);

  if (!cuts.length) continue;
  cuts.sort((a, b) => b[0] - a[0]);
  let out = src;
  for (const [s, e] of cuts) out = out.slice(0, s) + out.slice(e);
  out = out.replace(/^\n+/, "");
  changed++;
  if (WRITE) writeFileSync(file, out);
}

console.log(`${WRITE ? "изменено" : "будет изменено"} файлов: ${changed}`);
if (leftovers.length) console.log(`руками (${leftovers.length}):\n${leftovers.join("\n")}`);
