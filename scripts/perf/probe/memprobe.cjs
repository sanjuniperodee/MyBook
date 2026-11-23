/* eslint-disable @typescript-eslint/no-require-imports -- предзагрузка --require и разовый разбор: CommonJS */
// Замер памяти пробного экземпляра: каждые 5 с — memoryUsage в файл; при появлении файла-триггера — список модулей.
const fs = require("node:fs");
const out = process.env.PROBE_OUT || "/tmp/memprobe.jsonl";
const trig = process.env.PROBE_TRIGGER || "/tmp/memprobe.dump";
setInterval(() => {
  const m = process.memoryUsage();
  const mb = (x) => Math.round(x / 1048576);
  fs.appendFileSync(out, JSON.stringify({ t: Date.now(), rss: mb(m.rss), heapTotal: mb(m.heapTotal), heapUsed: mb(m.heapUsed), external: mb(m.external), ab: mb(m.arrayBuffers) }) + "\n");
  if (fs.existsSync(trig)) {
    fs.rmSync(trig);
    const pkgs = {};
    let chunks = 0;
    for (const k of Object.keys(require.cache)) {
      const i = k.lastIndexOf("node_modules/");
      if (i < 0) { chunks++; continue; }
      const rest = k.slice(i + 13).split("/");
      const name = rest[0].startsWith("@") ? rest[0] + "/" + rest[1] : rest[0];
      let size = 0; try { size = fs.statSync(k).size; } catch {}
      pkgs[name] = (pkgs[name] || 0) + size;
    }
    fs.writeFileSync(out + ".modules.json", JSON.stringify({ chunks, pkgs: Object.entries(pkgs).sort((a, b) => b[1] - a[1]) }, null, 1));
  }
}, 5000).unref();
