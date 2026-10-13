// Граф импортов src/: статические, динамические import(), type-импорты и реэкспорты.
// Печатает нарушения границ: импорты между модулями, модуль → server/components/app, shared → modules.
// Запуск: node scripts/refactor/imports.mjs [--json out.json]
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const src = path.join(root, "src");
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(name)) files.push(p);
  }
})(src);

const IMPORT = /(?:import|export)\s+(type\s+)?(?:[\s\S]*?\sfrom\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

function resolve(from, spec) {
  let base;
  if (spec.startsWith("@/")) base = path.join(src, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  for (const c of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx"), base]) if (existsSync(c) && statSync(c).isFile()) return c;
  return base;
}

const edges = [];
for (const f of files) {
  const text = readFileSync(f, "utf8");
  for (const m of text.matchAll(IMPORT)) {
    const to = resolve(f, m[2] ?? m[3]);
    if (to) edges.push({ from: path.relative(root, f), to: path.relative(root, to), typeOnly: !!m[1], dynamic: !!m[3] });
  }
}

const moduleOf = (p) => p.match(/^src\/modules\/([^/]+)\//)?.[1] ?? null;
const top = (p) => p.replace(/^src\//, "").split("/")[0].replace(/\.tsx?$/, "");
const tag = (e) => `${e.typeOnly ? " (type)" : ""}${e.dynamic ? " (dynamic)" : ""}`;

const crossModule = edges.filter((e) => moduleOf(e.from) && moduleOf(e.to) && moduleOf(e.from) !== moduleOf(e.to));
const moduleOutward = edges.filter((e) => moduleOf(e.from) && ["server", "components", "app"].includes(top(e.to)));
const sharedToModules = edges.filter((e) => top(e.from) === "shared" && moduleOf(e.to));

const report = { files: files.length, edges: edges.length, crossModule, moduleOutward, sharedToModules };
const i = process.argv.indexOf("--json");
if (i > 0) writeFileSync(process.argv[i + 1], JSON.stringify({ ...report, all: edges }, null, 1));

console.log(`файлов: ${files.length}, импортов: ${edges.length}`);
for (const [title, list] of [
  ["импорты между модулями", crossModule],
  ["модуль → server/components/app", moduleOutward],
  ["shared → modules", sharedToModules],
]) {
  console.log(`\n## ${title}: ${list.length}`);
  for (const e of list) console.log(`  ${e.from} -> ${e.to}${tag(e)}`);
}
