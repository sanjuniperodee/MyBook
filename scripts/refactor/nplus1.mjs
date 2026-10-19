// Эвристика N+1: await обращения к БД, репозиторию или сервису внутри цикла или внутри .map(), обёрнутого в Promise.all.
// Находки нужно проверять глазами. Запуск: node scripts/refactor/nplus1.mjs
import { createRequire } from "node:module";
import { readdirSync, readFileSync, statSync } from "node:fs";
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

const LOOPS = new Set([K.ForStatement, K.ForOfStatement, K.ForInStatement, K.WhileStatement, K.DoStatement]);
const FUNCTIONS = new Set([K.FunctionDeclaration, K.ArrowFunction, K.FunctionExpression, K.MethodDeclaration]);
const IO = /\b(db|executor\(\)|tx|repo|queries|container\(\)|this\.\w+|fetch|getSetting|getFile|putFile|find\w*|load\w*|select)\b/;
const isMapCall = (n) => ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && ["map", "forEach", "flatMap"].includes(n.expression.name.text);

for (const file of files) {
  const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const rel = path.relative(root, file);
  (function visit(node, inLoop, inMap) {
    if (ts.isAwaitExpression(node) && (inLoop || inMap)) {
      const call = node.expression.getText(sf).slice(0, 110).replace(/\s+/g, " ");
      if (IO.test(call)) console.log(`${rel}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1} ${inLoop ? "цикл" : "Promise.all(map)"} :: await ${call}`);
    }
    const parallelMap = isMapCall(node) && node.parent && ts.isCallExpression(node.parent) && /Promise\.(all|allSettled)/.test(node.parent.expression.getText(sf));
    const loop = inLoop || LOOPS.has(node.kind);
    ts.forEachChild(node, (child) => visit(child, FUNCTIONS.has(node.kind) && !inMap ? false : loop, inMap || parallelMap));
  })(sf, false, false);
}
