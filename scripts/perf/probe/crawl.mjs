// Обход маршрутов пробного экземпляра: node crawl.mjs <порт> <release> [all|public|filter-regex]
// Динамические сегменты — заглушки (нулевой uuid): данные не находятся, но модуль маршрута загружается.
import fs from "node:fs";
const [port, rel, mode = "all"] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(`${rel}/.next/server/app-paths-manifest.json`, "utf8"));
const Z = "00000000-0000-4000-8000-000000000000";
const paths = new Set();
for (const key of Object.keys(manifest)) {
  let p = key.replace(/\/(page|route)$/, "").replace(/\/\([^)]+\)/g, "").replace(/\/@[^/]+/g, "");
  if (/\/_|opengraph|icon|sitemap|robots|manifest/.test(p) && !/sitemap/.test(mode)) continue;
  p = p.replace(/\[\[?\.\.\.[^\]]+\]\]?/g, "x").replace(/\[(id|[a-z]*Id|bookId|pid|mid|att|fileId)\]/g, Z).replace(/\[[^\]]+\]/g, "x");
  paths.add(p || "/");
}
let list = [...paths].sort();
if (mode === "public") list = list.filter((p) => !p.startsWith("/admin") && !p.startsWith("/api"));
else if (mode !== "all") list = list.filter((p) => new RegExp(mode).test(p));
const stat = {};
for (const p of list) {
  const t = Date.now();
  try {
    const r = await fetch(`http://localhost:${port}${p}`, { redirect: "manual", signal: AbortSignal.timeout(20000), headers: { "x-forwarded-proto": "https" } });
    await r.arrayBuffer();
    stat[r.status] = (stat[r.status] || 0) + 1;
  } catch { stat.err = (stat.err || 0) + 1; }
  if (Date.now() - t > 3000) console.log("slow", p, Date.now() - t);
}
console.log(list.length, "routes", JSON.stringify(stat));
