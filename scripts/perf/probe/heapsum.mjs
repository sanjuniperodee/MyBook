// Сводка heap snapshot: собственный размер по типу/имени узла и крупнейшие строки/код.
import fs from "node:fs";
const snap = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const m = snap.snapshot.meta, F = m.node_fields, N = F.length;
const types = m.node_types[0];
const iT = F.indexOf("type"), iN = F.indexOf("name"), iS = F.indexOf("self_size");
const nodes = snap.nodes, strings = snap.strings;
const byKey = new Map(); let total = 0;
const big = [];
for (let i = 0; i < nodes.length; i += N) {
  const t = types[nodes[i + iT]], name = strings[nodes[i + iN]], s = nodes[i + iS];
  total += s;
  const key = t === "object" || t === "closure" || t === "native" ? `${t}:${name.slice(0, 60)}` : t;
  byKey.set(key, (byKey.get(key) || 0) + s);
  if (s > 200_000) big.push([s, t, name.slice(0, 120).replace(/\s+/g, " ")]);
}
console.log("total MB", (total / 1048576).toFixed(1));
for (const [k, v] of [...byKey].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log((v / 1048576).toFixed(1).padStart(7), k);
console.log("--- biggest nodes");
for (const b of big.sort((a, b) => b[0] - a[0]).slice(0, 40)) console.log((b[0] / 1048576).toFixed(2).padStart(6), b[1], b[2]);
