#!/usr/bin/env node
// Сводка журнала замеров (G1, src/shared/infrastructure/perfLog.ts): вёрстка PDF, память процессов, отдача файлов.
//   ssh srv@<сервер> 'cat ~/mybook-logs/perf-*.jsonl' | node scripts/perf/perf-summary.mjs [--since 2026-11-24T00:00]
//   node scripts/perf/perf-summary.mjs <файл.jsonl>...
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const sinceAt = args.indexOf("--since");
const since = sinceAt >= 0 ? args.splice(sinceAt, 2)[1] : "";
const text = args.length ? args.map((f) => readFileSync(f, "utf8")).join("\n") : readFileSync(0, "utf8");
const rows = text
  .split("\n")
  .filter(Boolean)
  .map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return null;
    }
  })
  .filter((r) => r && (!since || r.t >= since));

const pct = (xs, p) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};
const table = (head, body) => {
  console.log(`| ${head.join(" | ")} |`);
  console.log(`|${head.map((_, i) => (i ? "---:" : "---")).join("|")}|`);
  for (const r of body) console.log(`| ${r.join(" | ")} |`);
  console.log();
};
const group = (xs, key) => xs.reduce((m, x) => m.set(key(x), [...(m.get(key(x)) ?? []), x]), new Map());

const span = rows.length ? `${rows[0].t} … ${rows[rows.length - 1].t}` : "—";
console.log(`Строк: ${rows.length}, период: ${span}\n`);

const pdf = rows.filter((r) => r.kind === "pdf");
if (pdf.length) {
  console.log("### Вёрстка PDF\n");
  table(
    ["Задача", "Запусков", "Ошибок", "p50, с", "p95, с", "max, с", "вёрстка p95, с", "ожидание max, с", "пик процесса max, МБ", "PDF, МБ (сред.)"],
    [...group(pdf, (r) => r.task)].map(([task, xs]) => {
      const ok = xs.filter((x) => x.ok);
      const ms = ok.map((x) => x.ms);
      return [
        task,
        xs.length,
        xs.length - ok.length,
        (pct(ms, 50) / 1000).toFixed(1),
        (pct(ms, 95) / 1000).toFixed(1),
        (Math.max(0, ...ms) / 1000).toFixed(1),
        (pct(ok.map((x) => x.renderMs ?? x.ms), 95) / 1000).toFixed(1),
        (Math.max(0, ...xs.map((x) => x.waitMs ?? 0)) / 1000).toFixed(1),
        Math.max(0, ...xs.map((x) => x.peakRssMb ?? 0)),
        ok.length ? (ok.reduce((s, x) => s + (x.outMb ?? 0), 0) / ok.length).toFixed(1) : "—",
      ];
    }),
  );
}

const mem = rows.filter((r) => r.kind === "mem");
if (mem.length) {
  console.log("### Память процессов (свой замер, раз в 5 мин)\n");
  table(
    ["Процесс", "Замеров", "RSS min", "RSS p50", "RSS max", "куча max", "вне кучи max", "RSS последний"],
    [...group(mem, (r) => r.proc)].map(([proc, xs]) => {
      const rss = xs.map((x) => x.rssMb);
      return [proc, xs.length, Math.min(...rss), pct(rss, 50), Math.max(...rss), Math.max(...xs.map((x) => x.heapMb)), Math.max(...xs.map((x) => x.externalMb)), rss[rss.length - 1]];
    }),
  );
}

const pm2 = rows.filter((r) => r.kind === "pm2");
if (pm2.length) {
  console.log("### Процессы PM2 (по /proc, раз в 5 мин)\n");
  const by = new Map();
  for (const r of pm2)
    for (const [name, p] of Object.entries(r.procs)) {
      const e = by.get(name) ?? { rss: [], peak: 0, kids: 0, kidPeak: 0 };
      e.rss.push(p.rssMb);
      e.peak = Math.max(e.peak, p.peakRssMb);
      for (const k of p.children ?? []) {
        e.kids = Math.max(e.kids, k.rssMb);
        e.kidPeak = Math.max(e.kidPeak, k.peakRssMb);
      }
      by.set(name, e);
    }
  table(
    ["Процесс", "RSS p50", "RSS max", "пик (VmHWM)", "дочерние max / пик"],
    [...by].map(([name, e]) => [name, pct(e.rss, 50), Math.max(...e.rss), e.peak, e.kids ? `${e.kids} / ${e.kidPeak}` : "—"]),
  );
}

const files = rows.filter((r) => r.kind === "files");
if (files.length) {
  console.log("### Отдача файлов и чтения хранилища\n");
  const by = new Map();
  for (const r of files)
    for (const [name, c] of Object.entries(r.counters)) {
      const e = by.get(name) ?? { n: 0, mb: 0, ms: 0, maxMs: 0, statuses: {} };
      e.n += c.n;
      e.mb += c.mb;
      e.ms += c.ms;
      e.maxMs = Math.max(e.maxMs, c.maxMs);
      for (const [s, k] of Object.entries(c.statuses ?? {})) e.statuses[s] = (e.statuses[s] ?? 0) + k;
      by.set(name, e);
    }
  table(
    ["Что", "Запросов", "МБ (известно)", "сред., мс", "max, мс", "Статусы"],
    [...by].sort((a, b) => b[1].n - a[1].n).map(([name, e]) => [name, e.n, e.mb.toFixed(1), (e.ms / e.n).toFixed(0), e.maxMs, Object.entries(e.statuses).map(([s, k]) => `${s}:${k}`).join(" ") || "—"]),
  );
}
