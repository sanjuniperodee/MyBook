import "server-only";
import { existsSync } from "node:fs";
import path from "node:path";
import * as threads from "node:worker_threads";
import type { Worker } from "node:worker_threads";
import type { RenderEvent, RenderReport } from "../../application/RenderProgress";
import { runPdfTask, type PdfTask, type PdfTaskResult } from "./worker-tasks";

/**
 * Вёрстка PDF в отдельном потоке. В Node.js ввод-вывод асинхронный, но сам JavaScript выполняется в одном потоке:
 * react-pdf верстал книгу десятки секунд, и всё это время сайт не отвечал. Здесь вёрстка уходит в worker_threads —
 * на своё ядро. Воркер один и живёт, пока есть работа (шрифты регистрируются один раз на поток); упал — следующая
 * задача поднимет новый. После простоя поток закрывается: после вёрстки он держал в процессе сайта ~0,4 ГБ, пока
 * никто ничего не верстал (замер 05.11: 1,6 ГБ с потоком, 1,2 ГБ без него).
 * Файла воркера нет (next dev, тесты) — задача выполняется в текущем потоке, как раньше.
 */
const WORKER_FILE = process.env.PDF_WORKER_FILE || path.join(process.cwd(), "pdf-worker.mjs");

/**
 * Предел кучи потока вёрстки, МБ. Без resourceLimits переполнение кучи в потоке валит весь процесс сайта (fatal OOM),
 * с ним — только поток: задача получает ошибку ERR_WORKER_OUT_OF_MEMORY, следующая поднимет новый поток.
 * 2048 — как неявный предел V8 на сервере (8 ГБ: heap_size_limit 2096 МБ), чтобы большие книги собирались как раньше.
 */
export function pdfWorkerHeapMb(value = process.env.PDF_WORKER_HEAP_MB): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 16 ? Math.floor(n) : 2048;
}

/**
 * Сколько минут поток может простаивать без задач, прежде чем закрыться и отдать память. 0 — не закрывать.
 * Следующая задача поднимет новый поток (запуск и регистрация шрифтов — доли секунды).
 */
export function pdfWorkerIdleMs(value = process.env.PDF_WORKER_IDLE_MIN): number {
  if (value === undefined || value === "") return 10 * 60_000;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 60_000) : 10 * 60_000;
}

let worker: Worker | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; report?: RenderReport }>();

function failAll(err: Error) {
  for (const p of pending.values()) p.reject(err);
  pending.clear();
}

function stopIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
}

/** Задач не осталось — через pdfWorkerIdleMs закрыть поток, если за это время не пришла новая. */
function armIdleTimer(w: Worker) {
  stopIdleTimer();
  const ms = pdfWorkerIdleMs();
  if (!ms || pending.size) return;
  idleTimer = setTimeout(() => {
    idleTimer = null;
    if (worker !== w || pending.size) return;
    worker = null;
    console.log(`[pdf-worker] поток вёрстки PDF закрыт после простоя (${Math.round(ms / 60_000)} мин)`);
    void w.terminate();
  }, ms);
  idleTimer.unref();
}

function getWorker(): Worker | null {
  if (worker) return worker;
  if (process.env.PDF_WORKER === "off" || !existsSync(WORKER_FILE)) return null;
  // Конструктор — через Reflect: увидев `new Worker(…)`, Turbopack пытается собрать воркер сам и падает при сборке.
  // Файл воркера собирает scripts/build-pdf-worker.mjs.
  const w: Worker = Reflect.construct(Reflect.get(threads, "Worker") as typeof Worker, [WORKER_FILE, { resourceLimits: { maxOldGenerationSizeMb: pdfWorkerHeapMb() } }]);
  w.on("message", (m: { id: number; ok?: boolean; result?: unknown; error?: string; progress?: RenderEvent }) => {
    const p = pending.get(m.id);
    if (!p) return;
    // Ход работы: задача ещё идёт, ответ будет позже.
    if (m.progress) {
      p.report?.(m.progress);
      return;
    }
    pending.delete(m.id);
    if (m.ok) p.resolve(m.result);
    else p.reject(new Error(`PDF: ${m.error}`));
    if (!pending.size) armIdleTimer(w);
  });
  w.on("error", (err) => {
    console.error("[pdf-worker]", err);
    if (worker === w) worker = null;
    failAll(err instanceof Error ? err : new Error(String(err)));
  });
  w.on("exit", (code) => {
    if (worker === w) {
      worker = null;
      stopIdleTimer();
    }
    if (pending.size) failAll(new Error(`PDF worker exited with code ${code}`));
  });
  console.log(`[pdf-worker] поток вёрстки PDF запущен (${path.basename(WORKER_FILE)})`);
  // Пока задач нет, поток не держит процесс (остановка PM2 не ждёт его).
  w.unref();
  worker = w;
  return w;
}

/** Выполнить задачу вёрстки в потоке PDF (или в текущем, если воркера нет). report получает начало этапов работы. */
export async function inPdfThread<T extends PdfTask>(job: T, report?: RenderReport): Promise<PdfTaskResult<T>> {
  const w = getWorker();
  if (!w) return (await runPdfTask(job, report)) as PdfTaskResult<T>;
  stopIdleTimer();
  const id = ++seq;
  return new Promise<PdfTaskResult<T>>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, report });
    w.postMessage({ id, job });
  });
}
