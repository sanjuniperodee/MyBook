// Какие файлы src/ импортируют тесты: напрямую и транзитивно (по статическим и динамическим импортам, без type-импортов).
// Грубая замена покрытию: файл, до которого не дотягивается ни один тест, точно не проверен.
// Импорты — по TypeScript AST из import-graph.mjs. Запуск: node scripts/refactor/testreach.mjs
import { existsSync } from "node:fs";
import path from "node:path";
import { parseImports, resolveImport, sourceFiles } from "./import-graph.mjs";

const root = process.cwd();
const src = path.join(root, "src");

// Обходим только существующие .ts/.tsx: стили, .mjs и пакеты пропускаем.
const depsOf = (file) =>
  parseImports(file)
    .filter((i) => !i.typeOnly)
    .map((i) => resolveImport(src, file, i.spec))
    .filter((p) => p && /\.tsx?$/.test(p) && existsSync(p));

// Как include в vitest.config.ts: tests/**/*.test.ts(x).
const tests = sourceFiles(path.join(root, "tests")).filter((f) => /\.test\.tsx?$/.test(f));
const direct = new Set();
const reached = new Set();
for (const t of tests) {
  const stack = depsOf(t);
  stack.forEach((d) => direct.add(d));
  while (stack.length) {
    const f = stack.pop();
    if (reached.has(f)) continue;
    reached.add(f);
    stack.push(...depsOf(f));
  }
}

const all = sourceFiles(src);
const group = (f) => {
  const r = path.relative(src, f).split(path.sep);
  if (r[0] === "modules") return `modules/${r[1]}/${r[2].replace(/\.tsx?$/, "")}`;
  if (r[0] === "lib") return `lib/${r.length > 2 ? r[1] : r[1].replace(/\.tsx?$/, "")}`;
  return r[0].replace(/\.tsx?$/, "");
};
const stats = new Map();
for (const f of all) {
  const s = stats.get(group(f)) ?? { files: 0, direct: 0, reached: 0, missed: [] };
  s.files++;
  if (direct.has(f)) s.direct++;
  if (reached.has(f)) s.reached++;
  else s.missed.push(path.relative(src, f));
  stats.set(group(f), s);
}
console.log("группа".padEnd(40), "файлов", "напрямую", "транзитивно");
for (const [g, s] of [...stats].sort()) console.log(g.padEnd(40), String(s.files).padStart(6), String(s.direct).padStart(8), String(s.reached).padStart(11));
console.log("\nНе достигнуты тестами (lib, domain, application):");
for (const [g, s] of [...stats].sort()) if (/^lib|domain$|application$/.test(g)) for (const m of s.missed) console.log(`  ${m}`);
