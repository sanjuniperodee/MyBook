#!/usr/bin/env node
// Время ответа MyBooks по маршрутам из лога nginx (формат mybook_timing, /etc/nginx/conf.d/mybook-timing.conf):
//   <время> <статус> <метод> "<uri>" <request_time> "<upstream_response_time>" <байт>
// Идентификаторы в путях (uuid, токены, числа) сводятся к :id/:token/:n, статика — в одну строку.
//
//   ssh <сервер> 'sudo cat /var/log/nginx/mybook-timing.log' | node scripts/perf/route-latency.mjs [--min 5] [--top 40]
//   node scripts/perf/route-latency.mjs --file mybook-timing.log
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LINE = /^(\S+) (\d{3}) (\S+) "([^"]*)" ([\d.]+) "([^"]*)" (\d+)$/;

export function routeOf(uri) {
  if (/^\/(_next\/static|_next\/image|fonts|images|icons|favicon|apple-touch|robots\.txt|sitemap)/.test(uri)) return "(статика)";
  return (
    uri
      .split("/")
      .map((seg) => {
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) return ":id";
        if (/^\d+$/.test(seg)) return ":n";
        if (seg.length >= 16 && /^[A-Za-z0-9_-]+$/.test(seg) && /\d/.test(seg)) return ":token";
        if (/\.(png|jpe?g|webp|svg|pdf|mp4|m4a|jpg)$/i.test(seg)) return ":file";
        return seg;
      })
      .join("/") || "/"
  );
}

function quantile(sorted, q) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
}

/** Строки лога → таблица по маршрутам (секунды). Строки другого формата пропускаются. */
export function summarize(text, { min = 5 } = {}) {
  const by = new Map();
  let skipped = 0;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const m = line.match(LINE);
    if (!m) {
      skipped++;
      continue;
    }
    const [, , status, method, uri, total] = m;
    const key = `${method} ${routeOf(uri)}`;
    const r = by.get(key) ?? { key, times: [], errors: 0 };
    r.times.push(Number(total));
    if (Number(status) >= 500) r.errors++;
    by.set(key, r);
  }
  const rows = [...by.values()]
    .filter((r) => r.times.length >= min)
    .map((r) => {
      const t = r.times.sort((a, b) => a - b);
      return { route: r.key, count: t.length, p50: quantile(t, 0.5), p95: quantile(t, 0.95), p99: quantile(t, 0.99), max: t[t.length - 1], errors5xx: r.errors };
    })
    .sort((a, b) => b.p95 - a.p95);
  return { rows, skipped, total: [...by.values()].reduce((n, r) => n + r.times.length, 0) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (name, def) => {
    const i = process.argv.indexOf(name);
    return i > 0 ? process.argv[i + 1] : def;
  };
  const file = arg("--file", null);
  const text = file ? readFileSync(file, "utf8") : readFileSync(0, "utf8");
  const { rows, skipped, total } = summarize(text, { min: Number(arg("--min", 5)) });
  const top = Number(arg("--top", 40));
  const ms = (s) => Math.round(s * 1000);
  console.log(`Запросов: ${total}, маршрутов (≥ ${arg("--min", 5)} запросов): ${rows.length}, пропущено строк: ${skipped}\n`);
  console.log("| Маршрут | Запросов | p50, мс | p95, мс | p99, мс | max, мс | 5xx |");
  console.log("|---|---:|---:|---:|---:|---:|---:|");
  for (const r of rows.slice(0, top)) console.log(`| \`${r.route}\` | ${r.count} | ${ms(r.p50)} | ${ms(r.p95)} | ${ms(r.p99)} | ${ms(r.max)} | ${r.errors5xx} |`);
}
