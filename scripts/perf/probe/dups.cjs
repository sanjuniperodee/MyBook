/* eslint-disable @typescript-eslint/no-require-imports -- предзагрузка --require и разовый разбор: CommonJS */
// Дубли модулей в серверных чанках Turbopack: сколько байт всего и сколько уникальных (по id модуля).
const fs = require("fs"), path = require("path");
const acorn = require(process.argv[3]);
const root = process.argv[2];
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const s = fs.statSync(p); if (s.isDirectory()) walk(p); else if (f.endsWith(".js")) files.push(p); } })(root);
const mods = new Map(); let total = 0, parsed = 0, other = 0;
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  total += Buffer.byteLength(src);
  let ast; try { ast = acorn.parse(src, { ecmaVersion: "latest", sourceType: "script" }); } catch { other += src.length; continue; }
  let arr = null;
  acorn_walk(ast);
  function acorn_walk(n) { if (arr || !n || typeof n !== "object") return; if (n.type === "AssignmentExpression" && n.right.type === "ArrayExpression" && src.slice(n.left.start, n.left.end) === "module.exports") { arr = n.right; return; } for (const k in n) { const v = n[k]; if (Array.isArray(v)) v.forEach(acorn_walk); else if (v && typeof v.type === "string") acorn_walk(v); } }
  if (!arr) { other += src.length; continue; }
  parsed++;
  const el = arr.elements;
  for (let i = 0; i < el.length; i++) {
    if (el[i] && el[i].type === "Literal" && typeof el[i].value === "number" && el[i + 1] && /Function/.test(el[i + 1].type)) {
      const id = el[i].value, fn = el[i + 1], len = fn.end - fn.start;
      const m = mods.get(id) || { n: 0, len: 0, snip: src.slice(fn.start, fn.start + 160).replace(/\s+/g, " "), files: [] };
      m.n++; m.len = Math.max(m.len, len); m.files.push(path.relative(root, f)); mods.set(id, m); i++;
    }
  }
}
let uniq = 0, dupBytes = 0;
for (const m of mods.values()) { uniq += m.len; dupBytes += m.len * (m.n - 1); }
console.log({ files: files.length, parsed, totalMB: (total / 1e6).toFixed(1), uniqueModulesMB: (uniq / 1e6).toFixed(1), duplicateMB: (dupBytes / 1e6).toFixed(1), nonModuleMB: (other / 1e6).toFixed(1), modules: mods.size });
const top = [...mods.entries()].sort((a, b) => b[1].len * (b[1].n - 1) - a[1].len * (a[1].n - 1)).slice(0, 40);
for (const [id, m] of top) console.log(((m.len * (m.n - 1)) / 1e6).toFixed(2).padStart(6), "MB dup", String(m.n).padStart(3), "x", (m.len / 1e3).toFixed(0).padStart(5), "KB", id, m.snip.slice(0, 110));
fs.writeFileSync("/tmp/gopilot/mods.json", JSON.stringify([...mods.entries()].map(([id, m]) => ({ id, n: m.n, len: m.len, snip: m.snip, files: m.files.slice(0, 3) }))));
