/**
 * Сверка отдачи файлов: старый путь (сайт сам — storage.openStoredFile + storedResponse, как маршруты в режиме off)
 * против Go-сервиса mybook-files на выборке настоящих файлов хранилища. Условие включения G3 — 100 % совпадений
 * (docs/microservices/10-go-plan-2026-11-24.md §4). Сравниваются статус, sha256 тела и заголовки файла
 * для запросов: целиком, Range (начало, середина, хвост, за концом), повтор с If-None-Match.
 *
 * Сборка и запуск на сервере (из папки релиза — там pg и .env):
 *   node scripts/files/build-parity.mjs            → /tmp/files-parity.mjs
 *   scp /tmp/files-parity.mjs srv@<сервер>:mybook-releases/current/
 *   cd ~/mybook-releases/current && node --env-file=$HOME/mybook/.env files-parity.mjs --per 40 [--via http://localhost:3040]
 * --via — ещё и через сайт (переписывание /files/* в next.config.ts): те же ответы должны прийти через Next.
 */
import { createHash } from "node:crypto";
import { createS3 } from "@/shared/infrastructure/s3";
import { openStoredFile } from "@/shared/infrastructure/storage";
import { storedResponse } from "@/server/range-file";
import { filesOrigin, filesSigningKey, signFileToken } from "@/server/files-service";

const args = process.argv.slice(2);
const opt = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const PER = Number(opt("per", "30"));
const VIA = opt("via", "");

/** Что сравниваем: заголовки файла; Date, Connection и общие заголовки сайта — нет (их ставит Next). */
const HEADERS = ["content-type", "content-length", "content-range", "accept-ranges", "etag", "cache-control", "content-disposition", "content-security-policy"];

/** Префиксы маршрутов и их заголовки — как в маршрутах сайта. */
const KINDS: { prefix: string; type: (key: string) => string; headers: Record<string, string> }[] = [
  { prefix: "photos/", type: () => "image/jpeg", headers: { "Cache-Control": "private, no-cache", ETag: '"route-etag"' } },
  { prefix: "orders/", type: (k) => (k.endsWith(".txt") ? "text/plain; charset=utf-8" : "application/pdf"), headers: { "Content-Disposition": 'attachment; filename="order-1-block.pdf"', "Cache-Control": "private, no-store" } },
  { prefix: "answer-media/", type: (k) => (k.endsWith(".mp4") ? "video/mp4" : k.endsWith(".jpg") ? "image/jpeg" : "audio/mp4"), headers: { "Cache-Control": "public, max-age=604800", "X-Robots-Tag": "noindex", "Cross-Origin-Resource-Policy": "same-site" } },
  {
    prefix: "support/",
    type: () => "application/octet-stream",
    headers: { "Cache-Control": "private, max-age=3600", "Content-Disposition": "inline; filename*=UTF-8''%D1%84%D0%B0%D0%B9%D0%BB.ogg", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; media-src 'self'" },
  },
];

type Snap = { status: number; sha: string; bytes: number; headers: Record<string, string>; ttfbMs: number };

async function snap(res: Response, t0: number): Promise<Snap> {
  const reader = res.body?.getReader();
  const hash = createHash("sha256");
  let bytes = 0;
  let ttfbMs = performance.now() - t0;
  if (reader) {
    let first = true;
    for (;;) {
      const { done, value } = await reader.read();
      if (first) ttfbMs = performance.now() - t0;
      first = false;
      if (done) break;
      hash.update(value);
      bytes += value.length;
    }
  }
  const headers: Record<string, string> = {};
  for (const h of HEADERS) {
    const v = res.headers.get(h);
    if (v !== null) headers[h] = v;
  }
  return { status: res.status, sha: hash.digest("hex").slice(0, 16), bytes, headers, ttfbMs };
}

function sample<T>(xs: T[], n: number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

async function main() {
  const { S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, APP_SECRET } = process.env;
  if (!S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY || !APP_SECRET) throw new Error("нужны S3_* и APP_SECRET (.env сайта)");
  const s3 = createS3({ endpoint: process.env.S3_ENDPOINT || "https://object.pscloud.io", region: process.env.S3_REGION || "us-east-1", bucket: S3_BUCKET, accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY, prefix: process.env.S3_PREFIX ?? "mybooks/" });
  const signing = filesSigningKey(APP_SECRET);
  const results = { compared: 0, mismatches: [] as unknown[], files: 0, bytes: 0, ttfb: { node: [] as number[], go: [] as number[], via: [] as number[] } };

  for (const kind of KINDS) {
    const objects = sample((await s3.list(kind.prefix)).filter((o) => o.size > 0), PER);
    for (const o of objects) {
      results.files++;
      results.bytes += o.size;
      const type = kind.type(o.key);
      const token = signFileToken({ key: o.key, type, headers: kind.headers, expires: Math.floor(Date.now() / 1000) + 600 }, signing);
      const mid = Math.floor(o.size / 2);
      const variants: Record<string, string>[] = [{}, { range: "bytes=0-99" }, { range: `bytes=${mid}-${mid + 4095}` }, { range: "bytes=-100" }, { range: `bytes=${o.size + 10}-` }, { range: "bytes=0-1,5-6" }];
      let etag = "";
      for (const v of [...variants, "etag" as const]) {
        const req = v === "etag" ? { "if-none-match": etag } : v;
        let t0 = performance.now();
        const old = await snap(storedResponse(await openStoredFile(o.key, { range: req.range, ifNoneMatch: req["if-none-match"] }), type, kind.headers)!, t0);
        t0 = performance.now();
        const go = await snap(await fetch(`${filesOrigin()}/files/${token}`, { headers: req }), t0);
        const pairs: [string, Snap][] = [["go", go]];
        if (VIA) {
          t0 = performance.now();
          pairs.push(["via", await snap(await fetch(`${VIA}/files/${token}`, { headers: req }), t0)]);
        }
        if (v !== "etag" && !v.range) etag = old.headers.etag ?? "";
        for (const [name, got] of pairs) {
          results.compared++;
          // У ответов без тела (304, 416) длину ставит сервер HTTP (net/http — «0», Node — по-своему): транспорт, не файл.
          const strip = (s: Snap) => (s.status === 304 || s.status === 416 ? Object.fromEntries(Object.entries(s.headers).filter(([k]) => k !== "content-length")) : s.headers);
          const same = old.status === got.status && old.sha === got.sha && JSON.stringify(strip(old)) === JSON.stringify(strip(got));
          if (!same) results.mismatches.push({ key: o.key, request: req, path: name, old: { status: old.status, sha: old.sha, headers: old.headers }, got: { status: got.status, sha: got.sha, headers: got.headers } });
        }
        if (v !== "etag" && !v.range) {
          results.ttfb.node.push(old.ttfbMs);
          results.ttfb.go.push(go.ttfbMs);
          if (VIA) results.ttfb.via.push(pairs[1][1].ttfbMs);
        }
      }
    }
  }
  const p = (xs: number[], q: number) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.ceil(q * xs.length) - 1)].toFixed(0) : "—");
  console.log(`Файлов: ${results.files} (${(results.bytes / 1048576).toFixed(1)} МБ), сравнений: ${results.compared}, расхождений: ${results.mismatches.length}`);
  for (const [name, xs] of Object.entries(results.ttfb)) if (xs.length) console.log(`  TTFB целого файла, ${name}: p50 ${p(xs, 0.5)} мс, p95 ${p(xs, 0.95)} мс`);
  for (const m of results.mismatches.slice(0, 20)) console.log(JSON.stringify(m));
  process.exit(results.mismatches.length ? 1 : 0);
}

void main().catch((err) => {
  console.error(err);
  process.exit(2);
});
