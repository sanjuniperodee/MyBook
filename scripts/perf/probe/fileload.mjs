// Нагрузка файлами на пробный экземпляр: node fileload.mjs <порт> <параллельно> <запросов> <токен>...
// Половина — целиком, половина — Range (как плеер). Печатает TTFB p50/p95, МБ/с, CPU и пик RSS процесса.
import fs from "node:fs";
const [port, conc, total, ...tokens] = process.argv.slice(2);
const pid = fs.readFileSync(`${process.env.HOME}/gopilot/probe-${port}.pid`, "utf8").trim();
const cpuOf = (p) => { const f = fs.readFileSync(`/proc/${p}/stat`, "utf8").split(") ")[1].split(" "); return (Number(f[11]) + Number(f[12])) / 100; };
const cpu = () => cpuOf(pid);
const goPid = fs.readdirSync(`${process.env.HOME}/.pm2/pids`).filter((f) => f.startsWith("mybook-files-")).map((f) => fs.readFileSync(`${process.env.HOME}/.pm2/pids/${f}`, "utf8").trim())[0];
const goCpu0 = goPid ? cpuOf(goPid) : 0;
const rss = () => Number(/VmRSS:\s+(\d+)/.exec(fs.readFileSync(`/proc/${pid}/status`, "utf8"))[1]) / 1024;
let peak = rss();
const sampler = setInterval(() => (peak = Math.max(peak, rss())), 100);
const cpu0 = cpu(), t0 = performance.now();
const ttfb = [];
let bytes = 0, errors = 0, i = 0;
async function worker() {
  while (i < Number(total)) {
    const n = i++;
    const tok = tokens[n % tokens.length];
    const headers = n % 2 ? { range: `bytes=${(n * 7919) % 100000}-` } : {};
    const s = performance.now();
    try {
      const r = await fetch(`http://localhost:${port}/api/v/${tok}`, { headers });
      const reader = r.body.getReader();
      let first = true;
      for (;;) { const { done, value } = await reader.read(); if (first) { ttfb.push(performance.now() - s); first = false; } if (done) break; bytes += value.length; }
      if (r.status >= 400) errors++;
    } catch { errors++; }
  }
}
await Promise.all(Array.from({ length: Number(conc) }, worker));
clearInterval(sampler);
const sec = (performance.now() - t0) / 1000;
ttfb.sort((a, b) => a - b);
const q = (p) => ttfb[Math.min(ttfb.length - 1, Math.ceil(p * ttfb.length) - 1)].toFixed(1);
console.log(`port ${port}: ${total} запросов, ${(bytes / 1048576).toFixed(0)} МБ за ${sec.toFixed(1)} с, TTFB p50 ${q(0.5)} p95 ${q(0.95)} мс, ошибок ${errors}, CPU сайта ${(cpu() - cpu0).toFixed(2)} с, CPU Go ${goPid ? (cpuOf(goPid) - goCpu0).toFixed(2) : "—"} с, пик RSS ${peak.toFixed(0)} МБ`);
