// Граф импортов src/: статические, динамические import(), type-импорты и реэкспорты,
// и нарушения границ по нему. Общий для scripts/refactor/imports.mjs и tests/architecture.test.ts.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const IMPORT = /(?:import|export)\s+(type\s+)?(?:[\s\S]*?\sfrom\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

function sourceFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

// "@/…" и относительные пути; пакеты — null. Если файла нет, остаётся путь без расширения.
function resolve(src, from, spec) {
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
    const text = readFileSync(f, "utf8");
    for (const m of text.matchAll(IMPORT)) {
      const to = resolve(src, f, m[2] ?? m[3]);
      if (to) edges.push({ from: path.relative(root, f), to: path.relative(root, to), typeOnly: !!m[1], dynamic: !!m[3] });
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
