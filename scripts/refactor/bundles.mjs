// Клиентский JS по маршрутам из сборки Next (Turbopack не печатает размеры): общие файлы, файлы входа
// и чанки клиентских модулей маршрута; ленивые чанки (next/dynamic) не входят. Сначала `npx next build`.
// Запуск: node scripts/refactor/bundles.mjs [--json out.json] [--compare before.json]
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { gzipSync } from "node:zlib";

const next = path.join(process.cwd(), ".next");
const manifests = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name === "page_client-reference-manifest.js") manifests.push(p);
  }
})(path.join(next, "server/app"));

const build = JSON.parse(readFileSync(path.join(next, "build-manifest.json"), "utf8"));
const sizes = new Map();
function size(file) {
  if (!sizes.has(file)) {
    const buf = readFileSync(path.join(next, file));
    sizes.set(file, { raw: buf.length, gz: gzipSync(buf, { level: 9 }).length });
  }
  return sizes.get(file);
}

const routes = [];
for (const manifest of manifests) {
  const ctx = { globalThis: {} };
  vm.runInNewContext(readFileSync(manifest, "utf8"), ctx);
  for (const [key, man] of Object.entries(ctx.globalThis.__RSC_MANIFEST)) {
    const chunks = new Set(build.rootMainFiles);
    for (const list of Object.values(man.entryJSFiles ?? {})) for (const f of list) chunks.add(f.replace(/^\/?_next\//, ""));
    for (const mod of Object.values(man.clientModules ?? {})) for (const f of mod.chunks ?? []) if (f.endsWith(".js")) chunks.add(f.replace(/^\/_next\//, ""));
    let raw = 0;
    let gz = 0;
    for (const f of chunks) {
      const s = size(f);
      raw += s.raw;
      gz += s.gz;
    }
    routes.push({ route: key.replace(/\/page$/, "").replace(/\/\([^)]+\)/g, "") || "/", chunks: chunks.size, raw, gz });
  }
}
routes.sort((a, b) => b.gz - a.gz);
const totalRaw = readdirSync(path.join(next, "static/chunks"))
  .filter((f) => f.endsWith(".js"))
  .reduce((s, f) => s + statSync(path.join(next, "static/chunks", f)).size, 0);

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : null;
};
if (arg("--json")) writeFileSync(arg("--json"), JSON.stringify({ totalStaticChunksRaw: totalRaw, routes }, null, 1));
const before = arg("--compare") ? new Map(JSON.parse(readFileSync(arg("--compare"), "utf8")).routes.map((r) => [r.route, r])) : null;

const kib = (n) => (n / 1024).toFixed(1);
console.log(`весь клиентский JS (static/chunks): ${kib(totalRaw)} KiB`);
console.log("маршрут".padEnd(36), "чанков", "     KiB", "  KiB gz", before ? "  Δ gz" : "");
for (const r of routes) {
  const delta = before?.get(r.route) ? r.gz - before.get(r.route).gz : null;
  console.log(r.route.padEnd(36), String(r.chunks).padStart(6), kib(r.raw).padStart(8), kib(r.gz).padStart(8), delta === null ? "" : `${delta > 0 ? "+" : ""}${kib(delta)}`.padStart(7));
}
