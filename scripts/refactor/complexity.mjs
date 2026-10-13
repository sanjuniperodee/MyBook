// Метрики функций src/: длина в строках, цикломатическая сложность, глубина вложенности; размеры файлов.
// Запуск: node scripts/refactor/complexity.mjs [--json out.json]
import { createRequire } from "node:module";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const ts = createRequire(path.join(root, "package.json"))("typescript");
const K = ts.SyntaxKind;
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(name)) files.push(p);
  }
})(path.join(root, "src"));

const FUNCTION_KINDS = new Set([K.FunctionDeclaration, K.FunctionExpression, K.ArrowFunction, K.MethodDeclaration, K.GetAccessor, K.SetAccessor, K.Constructor]);
const BRANCH_KINDS = new Set([K.IfStatement, K.ConditionalExpression, K.ForStatement, K.ForInStatement, K.ForOfStatement, K.WhileStatement, K.DoStatement, K.CaseClause, K.CatchClause]);
const NESTING_KINDS = new Set([K.IfStatement, K.ForStatement, K.ForInStatement, K.ForOfStatement, K.WhileStatement, K.DoStatement, K.SwitchStatement, K.TryStatement, K.ConditionalExpression]);
const LOGICAL = new Set([K.AmpersandAmpersandToken, K.BarBarToken, K.QuestionQuestionToken]);

function functionName(node, sf) {
  if (node.name) return node.name.getText(sf);
  const parent = node.parent;
  if (parent && (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent))) return parent.name.getText(sf);
  if (parent && ts.isCallExpression(parent)) return `<callback ${parent.expression.getText(sf).slice(0, 30)}>`;
  return node.kind === K.Constructor ? "constructor" : "<anonymous>";
}

const functions = [];
const fileStats = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const rel = path.relative(root, file);
  fileStats.push({ file: rel, lines: text.split("\n").length });
  const measure = (fn) => {
    let cc = 1;
    let depth = 0;
    (function visit(node, level) {
      if (node !== fn && FUNCTION_KINDS.has(node.kind)) return; // вложенные функции считаются отдельно
      if (BRANCH_KINDS.has(node.kind)) cc++;
      if (node.kind === K.BinaryExpression && LOGICAL.has(node.operatorToken.kind)) cc++;
      const next = NESTING_KINDS.has(node.kind) ? level + 1 : level;
      depth = Math.max(depth, next);
      ts.forEachChild(node, (child) => visit(child, next));
    })(fn, 0);
    const start = sf.getLineAndCharacterOfPosition(fn.getStart(sf)).line + 1;
    const end = sf.getLineAndCharacterOfPosition(fn.end).line + 1;
    functions.push({ file: rel, line: start, name: functionName(fn, sf), lines: end - start + 1, cc, depth });
  };
  (function walk(node) {
    if (FUNCTION_KINDS.has(node.kind)) measure(node);
    ts.forEachChild(node, walk);
  })(sf);
}

const i = process.argv.indexOf("--json");
if (i > 0) writeFileSync(process.argv[i + 1], JSON.stringify({ functions, files: fileStats }));

const top = (key, n) => [...functions].sort((a, b) => b[key] - a[key]).slice(0, n);
const row = (x) => `${String(x.lines).padStart(5)} ${String(x.cc).padStart(4)} ${String(x.depth).padStart(3)}  ${x.file}:${x.line} ${x.name}`;
console.log(`файлов: ${fileStats.length}, строк: ${fileStats.reduce((s, f) => s + f.lines, 0)}, файлов > 300 строк: ${fileStats.filter((f) => f.lines > 300).length}`);
console.log(`функций: ${functions.length}, > 60 строк: ${functions.filter((x) => x.lines > 60).length}, сложность > 15: ${functions.filter((x) => x.cc > 15).length}, вложенность > 4: ${functions.filter((x) => x.depth > 4).length}`);
console.log("\nстроки  сложн. влож.  — самые длинные");
for (const x of top("lines", 30)) console.log(row(x));
console.log("\nстроки  сложн. влож.  — самые разветвлённые");
for (const x of top("cc", 30)) console.log(row(x));
