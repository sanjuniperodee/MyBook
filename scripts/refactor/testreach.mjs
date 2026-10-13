// Какие файлы src/ импортируют тесты: напрямую и транзитивно (по статическим импортам, без type-импортов).
// Грубая замена покрытию: файл, до которого не дотягивается ни один тест, точно не проверен.
// Запуск: node scripts/refactor/testreach.mjs
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const src = path.join(root, "src");
const IMPORT = /(?:import|export)\s+(type\s+)?(?:[\s\S]*?\sfrom\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

function resolve(from, spec) {
  let base;
  if (spec.startsWith("@/")) base = path.join(src, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  for (const c of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) if (existsSync(c) && statSync(c).isFile()) return c;
  return null;
}
const depsOf = (file) => [...readFileSync(file, "utf8").matchAll(IMPORT)].filter((m) => !m[1]).flatMap((m) => resolve(file, m[2] ?? m[3]) ?? []);

const tests = readdirSync(path.join(root, "tests"))
  .filter((f) => /\.test\.tsx?$/.test(f))
  .map((f) => path.join(root, "tests", f));
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

const all = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(name)) all.push(p);
  }
})(src);
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
