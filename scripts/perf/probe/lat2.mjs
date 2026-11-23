// Задержка по адресам, два экземпляра поочерёдно: node lat2.mjs <портA> <портB> <раз> <путь>...
const [a, b, times, ...paths] = process.argv.slice(2);
const res = {};
async function hit(port, p) {
  const t = performance.now();
  const r = await fetch(`http://localhost:${port}${p}`, { headers: { "x-forwarded-proto": "https" } });
  await r.arrayBuffer();
  (res[`${p} ${port}`] ??= []).push(performance.now() - t);
}
for (let i = 0; i < Number(times); i++) for (const p of paths) { if (i % 2) { await hit(a, p); await hit(b, p); } else { await hit(b, p); await hit(a, p); } }
const q = (xs, p) => { const s = [...xs].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)].toFixed(1); };
for (const p of paths) console.log(p.padEnd(40), [a, b].map((port) => `${port}: p50 ${q(res[`${p} ${port}`], 0.5)} p95 ${q(res[`${p} ${port}`], 0.95)}`).join("   "));
