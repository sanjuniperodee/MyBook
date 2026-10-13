// Граф импортов src/: статические, динамические import(), type-импорты и реэкспорты.
// Печатает нарушения границ: импорты между модулями, модуль → server/components/app, shared → modules.
// Запуск: node scripts/refactor/imports.mjs [--json out.json]
import { writeFileSync } from "node:fs";
import { CATEGORIES, edgeLabel, importGraph, violations } from "./import-graph.mjs";

const { files, edges } = importGraph(process.cwd());
const found = violations(edges);

const report = { files: files.length, edges: edges.length, ...found };
const i = process.argv.indexOf("--json");
if (i > 0) writeFileSync(process.argv[i + 1], JSON.stringify({ ...report, all: edges }, null, 1));

console.log(`файлов: ${files.length}, импортов: ${edges.length}`);
for (const [key, title] of CATEGORIES) {
  console.log(`\n## ${title}: ${found[key].length}`);
  for (const e of found[key]) console.log(`  ${edgeLabel(e)}`);
}
