/**
 * Замер вёрстки книги на сервере: печатный пакет (printPackage) и PDF для чтения (reading) — в процессе вёрстки
 * (pdf/pool.ts → pdf-worker.mjs), как после оплаты. Результат — только байты в памяти: в файлы заказа ничего не пишется.
 * Печатает время, этапы (images, flow, final, cover) и пик памяти процессов вёрстки (RSS, по ps каждые 200 мс).
 *
 *   cd ~/mybook && NODE_ENV=production PDF_WORKER_FILE=$HOME/mybook-releases/current/pdf-worker.mjs \
 *     npx tsx --import ./scripts/preload.mjs scripts/perf/pdf-book.ts <id книги> [номер заказа]
 */
import { execFileSync } from "node:child_process";
import type { RenderReport } from "@/modules/production/application/RenderProgress";

const [bookId, orderNumber = "0"] = process.argv.slice(2);
if (!bookId) throw new Error("Нужен id книги");

const { container } = await import("@/server/container");
const { inPdfThread } = await import("@/modules/production/infrastructure/pdf/pool");

/** Сумма RSS процессов вёрстки — потомков этого процесса, МБ. */
function workerRss() {
  try {
    const out = execFileSync("ps", ["-o", "rss=", "--ppid", String(process.pid)]).toString();
    return out.split("\n").reduce((a, l) => a + (Number(l.trim()) || 0), 0) / 1024;
  } catch {
    return 0;
  }
}

async function measure(name: string, run: (report: RenderReport) => Promise<{ bytes: number; pages?: number }>) {
  const stages: string[] = [];
  let peak = 0;
  const timer = setInterval(() => (peak = Math.max(peak, workerRss())), 200);
  const t0 = performance.now();
  const res = await run((e) => {
    if ("stage" in e && e.stage) stages.push(`${e.stage}@${((performance.now() - t0) / 1000).toFixed(1)}s ${Math.round(workerRss())} МБ`);
  });
  const ms = performance.now() - t0;
  clearInterval(timer);
  console.log(`${name}: ${(ms / 1000).toFixed(1)} с, полос ${res.pages ?? "—"}, ${(res.bytes / 2 ** 20).toFixed(1)} МБ, пик процесса вёрстки ${Math.round(peak)} МБ`);
  console.log(`  этапы: ${stages.join(" | ")}`);
}

const t = performance.now();
const bundle = await container().authoring.queries.bundle(bookId);
if (!bundle) throw new Error(`Нет книги ${bookId}`);
console.log(`${bookId}: фото ${bundle.photos.length}, данные ${Math.round(performance.now() - t)} мс`);

await measure("printPackage", async (report) => {
  const res = await inPdfThread({ task: "printPackage", bundle, order: { number: Number(orderNumber) } }, report);
  return { bytes: res.interior.byteLength + res.cover.byteLength, pages: res.pageCount };
});
await measure("reading", async (report) => {
  const res = await inPdfThread({ task: "reading", bundle }, report);
  return { bytes: res.byteLength };
});
process.exit(0);
