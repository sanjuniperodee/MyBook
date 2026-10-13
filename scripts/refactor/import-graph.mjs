// Граф импортов src/ по TypeScript AST: статические и побочные импорты, import type, реэкспорты,
// import(), import("…") в типах, import x = require(); комментарии и строки не считаются.
// Нарушения границ по нему. Общий для scripts/refactor/{imports,testreach}.mjs и tests/architecture.test.ts.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

/** Все .ts/.tsx в каталоге, рекурсивно. */
export function sourceFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

// Непустой список привязок, каждая с type: `import { type A, type B }`, `export { type A }`.
const allTypeOnly = (elements) => elements.length > 0 && elements.every((e) => e.isTypeOnly);

// Узел-импорт → { spec: узел пути, typeOnly, dynamic }; остальное → null.
function importOf(node) {
  if (ts.isImportDeclaration(node)) {
    const c = node.importClause;
    const named = c && !c.name && c.namedBindings && ts.isNamedImports(c.namedBindings) && allTypeOnly(c.namedBindings.elements);
    return { spec: node.moduleSpecifier, typeOnly: !!c && (c.isTypeOnly || !!named), dynamic: false };
  }
  if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
    const named = node.exportClause && ts.isNamedExports(node.exportClause) && allTypeOnly(node.exportClause.elements);
    return { spec: node.moduleSpecifier, typeOnly: node.isTypeOnly || !!named, dynamic: false };
  }
  if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) return { spec: node.arguments[0], typeOnly: false, dynamic: true };
  if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) return { spec: node.argument.literal, typeOnly: true, dynamic: false };
  if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) return { spec: node.moduleReference.expression, typeOnly: node.isTypeOnly, dynamic: false };
  return null;
}

/** Импорты файла в порядке текста: { spec, typeOnly, dynamic }. import() с вычисляемым путём пропускается. */
export function parseImports(file) {
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const out = [];
  const visit = (node) => {
    const imp = importOf(node);
    if (imp?.spec && ts.isStringLiteralLike(imp.spec)) out.push({ spec: imp.spec.text, typeOnly: imp.typeOnly, dynamic: imp.dynamic });
    ts.forEachChild(node, visit);
  };
  // JSDoc не разбираем: на импорты не влияет, а разбор быстрее.
  const options = { languageVersion: ts.ScriptTarget.Latest, jsDocParsingMode: ts.JSDocParsingMode.ParseNone };
  visit(ts.createSourceFile(file, readFileSync(file, "utf8"), options, false, kind));
  return out;
}

/** "@/…" (от src) и относительные пути; пакеты — null. Если файла нет, остаётся путь без расширения. */
export function resolveImport(src, from, spec) {
  let base;
  if (spec.startsWith("@/")) base = path.join(src, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  for (const c of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx"), base]) if (existsSync(c) && statSync(c).isFile()) return c;
  return base;
}

/** Файлы root/src и рёбра импортов между ними; пути рёбер — относительно root. */
export function importGraph(root) {
  const src = path.join(root, "src");
  const files = sourceFiles(src);
  const edges = [];
  for (const f of files) {
    for (const { spec, typeOnly, dynamic } of parseImports(f)) {
      const to = resolveImport(src, f, spec);
      if (to) edges.push({ from: path.relative(root, f), to: path.relative(root, to), typeOnly, dynamic });
    }
  }
  return { files, edges };
}

const moduleOf = (p) => p.match(/^src\/modules\/([^/]+)\//)?.[1] ?? null;
const top = (p) => p.replace(/^src\//, "").split("/")[0].replace(/\.tsx?$/, "");

/** Категории нарушений границ в порядке отчёта. */
export const CATEGORIES = [
  ["crossModule", "импорты между модулями"],
  ["moduleOutward", "модуль → server/components/app"],
  ["sharedToModules", "shared → modules"],
];

export function violations(edges) {
  return {
    crossModule: edges.filter((e) => moduleOf(e.from) && moduleOf(e.to) && moduleOf(e.from) !== moduleOf(e.to)),
    moduleOutward: edges.filter((e) => moduleOf(e.from) && ["server", "components", "app"].includes(top(e.to))),
    sharedToModules: edges.filter((e) => top(e.from) === "shared" && moduleOf(e.to)),
  };
}

export const edgeLabel = (e) => `${e.from} -> ${e.to}${e.typeOnly ? " (type)" : ""}${e.dynamic ? " (dynamic)" : ""}`;
