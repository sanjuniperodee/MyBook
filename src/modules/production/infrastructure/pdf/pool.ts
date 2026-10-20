import "server-only";
import { existsSync } from "node:fs";
import path from "node:path";
import * as threads from "node:worker_threads";
import type { Worker } from "node:worker_threads";
import { runPdfTask, type PdfTask, type PdfTaskResult } from "./worker-tasks";

/**
 * Вёрстка PDF в отдельном потоке. В Node.js ввод-вывод асинхронный, но сам JavaScript выполняется в одном потоке:
 * react-pdf верстал книгу десятки секунд, и всё это время сайт не отвечал. Здесь вёрстка уходит в worker_threads —
 * на своё ядро. Воркер один и живёт долго (шрифты регистрируются один раз); упал — следующая задача поднимет новый.
 * Файла воркера нет (next dev, тесты) — задача выполняется в текущем потоке, как раньше.
 */
const WORKER_FILE = process.env.PDF_WORKER_FILE || path.join(process.cwd(), "pdf-worker.mjs");

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function failAll(err: Error) {
  for (const p of pending.values()) p.reject(err);
  pending.clear();
}

function getWorker(): Worker | null {
  if (worker) return worker;
  if (process.env.PDF_WORKER === "off" || !existsSync(WORKER_FILE)) return null;
  // Конструктор — через Reflect: увидев `new Worker(…)`, Turbopack пытается собрать воркер сам и падает при сборке.
  // Файл воркера собирает scripts/build-pdf-worker.mjs.
  const w: Worker = Reflect.construct(Reflect.get(threads, "Worker") as typeof Worker, [WORKER_FILE]);
  w.on("message", (m: { id: number; ok: boolean; result?: unknown; error?: string }) => {
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.ok) p.resolve(m.result);
    else p.reject(new Error(`PDF: ${m.error}`));
  });
  w.on("error", (err) => {
    console.error("[pdf-worker]", err);
    if (worker === w) worker = null;
    failAll(err instanceof Error ? err : new Error(String(err)));
  });
  w.on("exit", (code) => {
    if (worker === w) worker = null;
    if (pending.size) failAll(new Error(`PDF worker exited with code ${code}`));
  });
  console.log(`[pdf-worker] поток вёрстки PDF запущен (${path.basename(WORKER_FILE)})`);
  // Пока задач нет, поток не держит процесс (остановка PM2 не ждёт его).
  w.unref();
  worker = w;
  return w;
}

/** Выполнить задачу вёрстки в потоке PDF (или в текущем, если воркера нет). */
export async function inPdfThread<T extends PdfTask>(job: T): Promise<PdfTaskResult<T>> {
  const w = getWorker();
  if (!w) return (await runPdfTask(job)) as PdfTaskResult<T>;
  const id = ++seq;
  return new Promise<PdfTaskResult<T>>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    w.postMessage({ id, job });
  });
}
