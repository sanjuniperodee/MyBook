/**
 * Сверка черновых проходов доводки вёрстки: по частям книги (pdf/drafts.tsx, как сейчас) против всей книги целиком
 * (как до 24.11, renderInterior { wholeBookDrafts }). На каждой книге итог должен совпасть: решения доводки (flow), число
 * полос, номера глав (chapterPages), виды полос (pages), полосы историй (entryPages) и текст каждой полосы
 * (pdftotext). Заодно — время и пик памяти обоих способов.
 *
 *   npx tsx --import ./scripts/preload.mjs scripts/pdf-draft-parity.ts <каталог выгрузок> [--mode print|reading|preview] [--jobs 3] [--filter <id>]
 *
 * Выгрузки — JSON книги из базы (scripts/visual/real-books.ts: как выгрузить только чтением); тексты клиентов — только
 * в локальном каталоге вне репозитория (tests/visual/out). Каждая книга — в своём процессе: память и время — её.
 * Код выхода: 0 — всё совпало, 1 — есть расхождения.
 */
import { execFileSync, fork } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { photoNamesFor } from "./visual/books";
import { realBooks } from "./visual/real-books";
import { runPool } from "./visual/shared";
import { useFixtureStorage as openFixtureStorage } from "../tests/fixtures/photos";

type Mode = "print" | "reading" | "preview";

interface Run {
  ms: number;
  rss: number;
  flow: string;
  /** Решения без значений масштабов рядов и сами масштабы. */
  flowRough: string;
  scales: [string, number][];
  pageCount: number;
  contentPages: number;
  chapterPages: string;
  pages: string;
  entryPages: string;
  text: string[];
}

/**
 * Решения доводки — строкой, без порядка вставки; digits — масштабы рядов (rowScale) до стольких значащих цифр. Масштаб
 * считается из координат Yoga (float32), и последние разряды у одной и той же раскладки зависят от того, сколько текста
 * ещё стоит в документе после полосы (react-pdf ужимает переполненную полосу, flexShrink 1): 0,924629362 против 0,924629284.
 */
function flowString(flow: Record<string, unknown>, rough = false) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(flow))
    out[k] = v instanceof Map ? [...v].sort(([a], [b]) => (a < b ? -1 : 1)).map(([m, x]) => [m, rough && k === "rowScale" ? null : x]) : v instanceof Set ? [...v].sort() : v;
  return JSON.stringify(out);
}

/** Масштабы рядов совпадают до 1e-6 (и ряды те же). */
const sameScales = (a: [string, number][], b: [string, number][]) => a.length === b.length && a.every(([m, x], i) => b[i][0] === m && Math.abs(b[i][1] - x) <= 1e-6 * Math.max(1, Math.abs(x)));

const sorted = (o: Record<string, unknown>) => JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));

/** Текст полос PDF по одной. */
function pageTexts(pdf: Buffer): string[] {
  const dir = mkdtempSync(path.join(tmpdir(), "draft-parity-"));
  try {
    writeFileSync(path.join(dir, "a.pdf"), pdf);
    return execFileSync("pdftotext", ["-enc", "UTF-8", path.join(dir, "a.pdf"), "-"], { maxBuffer: 256 << 20 }).toString().split("\f");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function worker(dir: string, id: string, mode: Mode, whole: boolean) {
  const book = realBooks(dir).find((b) => b.bundle.book.id === id)!;
  await openFixtureStorage(undefined, photoNamesFor([book]));
  const render = await import("@/modules/production/infrastructure/pdf/render");
  let peak = process.memoryUsage().rss;
  const timer = setInterval(() => (peak = Math.max(peak, process.memoryUsage().rss)), 50);
  const started = performance.now();
  const res = await render.renderInterior(book.bundle, mode, undefined, { wholeBookDrafts: whole });
  const ms = performance.now() - started;
  clearInterval(timer);
  peak = Math.max(peak, process.memoryUsage().rss);
  const run: Run = {
    ms,
    rss: peak,
    flow: flowString(res.flow as unknown as Record<string, unknown>),
    flowRough: flowString(res.flow as unknown as Record<string, unknown>, true),
    scales: [...res.flow.rowScale].sort(([a], [b]) => (a < b ? -1 : 1)),
    pageCount: res.pageCount,
    contentPages: res.contentPages,
    chapterPages: sorted(res.chapterPages),
    pages: JSON.stringify(res.pages),
    entryPages: sorted(res.entryPages),
    text: pageTexts(res.pdf),
  };
  process.send!(run);
}

function runChild(dir: string, id: string, mode: Mode, whole: boolean): Promise<Run> {
  return new Promise((resolve, reject) => {
    const child = fork(process.argv[1], ["--worker", dir, id, mode, whole ? "whole" : "parts"], { stdio: ["ignore", "pipe", "pipe", "ipc"], execArgv: process.execArgv });
    let log = "";
    child.stdout?.on("data", (d) => (log += d));
    child.stderr?.on("data", (d) => (log += d));
    let reply: Run | undefined;
    child.on("message", (m) => (reply = m as Run));
    child.on("exit", (code) => (reply && code === 0 ? resolve(reply) : reject(new Error(`${id} (${whole ? "целиком" : "по частям"}): ${code}\n${log.slice(-3000)}`))));
  });
}

async function main() {
  if (process.argv[2] === "--worker") {
    const [, , , dir, id, mode, how] = process.argv;
    await worker(dir, id, mode as Mode, how === "whole");
    return;
  }
  const { values, positionals } = parseArgs({ args: process.argv.slice(2), allowPositionals: true, options: { mode: { type: "string" }, jobs: { type: "string" }, filter: { type: "string" } } });
  const dir = path.resolve(positionals[0] ?? "tests/visual/out/orders");
  const mode = (values.mode ?? "print") as Mode;
  const books = realBooks(dir).filter((b) => !values.filter || b.bundle.book.id.includes(values.filter));
  // Большие книги — первыми: пул заканчивает раньше.
  books.sort((a, b) => b.bundle.photos.length - a.bundle.photos.length);
  let bad = 0;
  let approx = 0;
  let sumOld = 0;
  let sumNew = 0;
  await runPool(books, Number(values.jobs ?? 2), async (b) => {
    const id = b.bundle.book.id;
    try {
      const [old, now] = [await runChild(dir, id, mode, true), await runChild(dir, id, mode, false)];
      const diffs: string[] = [];
      for (const k of ["flowRough", "pageCount", "contentPages", "chapterPages", "pages", "entryPages"] as const) if (old[k] !== now[k]) diffs.push(k);
      if (!sameScales(old.scales, now.scales)) diffs.push("rowScale");
      const noise = !diffs.length && old.flow !== now.flow;
      if (noise) approx++;
      const textDiff = old.text.length !== now.text.length ? -1 : old.text.findIndex((t, i) => t !== now.text[i]);
      if (textDiff !== -1) diffs.push(`текст (полоса ${textDiff + 1})`);
      sumOld += old.ms;
      sumNew += now.ms;
      if (diffs.length) bad++;
      const mb = (v: number) => `${Math.round(v / 2 ** 20)} МБ`;
      console.log(
        `${diffs.length ? "✗" : "✓"} ${id.slice(0, 8)} фото ${b.bundle.photos.length}, полос ${now.contentPages}: ${(old.ms / 1000).toFixed(1)} с → ${(now.ms / 1000).toFixed(1)} с, пик ${mb(old.rss)} → ${mb(now.rss)}${noise ? " · rowScale совпал до 1e-6" : ""}${diffs.length ? ` · РАЗНИЦА: ${diffs.join(", ")}` : ""}`,
      );
    } catch (e) {
      bad++;
      console.log(`✗ ${id.slice(0, 8)}: ошибка ${(e as Error).message}`);
    }
  });
  console.log(`\nКниг: ${books.length}, расхождений: ${bad}, rowScale только до 1e-6: ${approx}. Время всего: ${(sumOld / 1000).toFixed(0)} с → ${(sumNew / 1000).toFixed(0)} с (режим ${mode}).`);
  process.exit(bad ? 1 : 0);
}

void main();
