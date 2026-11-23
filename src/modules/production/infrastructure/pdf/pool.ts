import "server-only";
import { existsSync } from "node:fs";
import path from "node:path";
import * as childProcess from "node:child_process";
import type { ChildProcess } from "node:child_process";
import type { RenderEvent, RenderReport } from "../../application/RenderProgress";
import { memorySnapshot, perfLog } from "@/shared/infrastructure/perfLog";
import { runPdfTask, type PdfTask, type PdfTaskResult } from "./worker-tasks";

/**
 * Вёрстка PDF в отдельном процессе. react-pdf верстает книгу десятки секунд чистым JS и на большой книге берёт гигабайты:
 * в процессе сайта (раньше — в worker_threads) это было опасно. Куча потока считалась в память процесса, и PM2
 * перезапускал сайт или mybook-worker по max_memory_restart посреди сборки (17.11, заказ №87: книга на 140 фото).
 * Теперь вёрстка — дочерний процесс (child_process.fork) со своей кучей: предел PM2 его не касается, переполнение
 * кучи или OOM-killer убивают только его (worker.ts просит ядро выбирать его первым), задача получает ошибку, а
 * следующая поднимет новый процесс. Процесс один и живёт, пока есть работа; после простоя закрывается.
 * Файла воркера нет (next dev, тесты, разовые скрипты) — задача выполняется в текущем процессе, как раньше.
 */
const WORKER_FILE = process.env.PDF_WORKER_FILE || path.join(process.cwd(), "pdf-worker.mjs");

/**
 * Предел кучи процесса вёрстки, МБ (--max-old-space-size). Процесс отдельный, поэтому предел не съедает память сайта:
 * по умолчанию 3072 — с запасом для самых больших книг (замер 17.11: 140 фото и 140 тыс. знаков — куча до ~0,5 ГБ,
 * весь процесс до ~2,3 ГБ).
 */
export function pdfWorkerHeapMb(value = process.env.PDF_WORKER_HEAP_MB): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 16 ? Math.floor(n) : 3072;
}

/**
 * Сколько минут процесс может простаивать без задач, прежде чем закрыться и отдать память. 0 — не закрывать.
 * Следующая задача поднимет новый процесс (запуск и шрифты — около секунды).
 */
export function pdfWorkerIdleMs(value = process.env.PDF_WORKER_IDLE_MIN): number {
  if (value === undefined || value === "") return 10 * 60_000;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 60_000) : 10 * 60_000;
}

let worker: ChildProcess | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let seq = 0;
/** Замер одной задачи для журнала: ожидание замка и то, что прислал процесс вёрстки. */
type PdfMeta = { waitMs: number; perf?: Record<string, number> };
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; report?: RenderReport; meta?: PdfMeta }>();

function failAll(err: Error) {
  for (const p of pending.values()) p.reject(err);
  pending.clear();
}

function stopIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
}

/** Держит ли процесс вёрстки родителя живым: да, пока есть задачи (иначе разовый скрипт вышел бы, не дождавшись). */
function hold(w: ChildProcess, on: boolean) {
  if (on) {
    w.ref();
    w.channel?.ref();
  } else {
    w.unref();
    w.channel?.unref();
  }
}

/** Задач не осталось — через pdfWorkerIdleMs закрыть процесс, если за это время не пришла новая. */
function armIdleTimer(w: ChildProcess) {
  stopIdleTimer();
  hold(w, false);
  const ms = pdfWorkerIdleMs();
  if (!ms || pending.size) return;
  idleTimer = setTimeout(() => {
    idleTimer = null;
    if (worker !== w || pending.size) return;
    worker = null;
    console.log(`[pdf-worker] процесс вёрстки PDF закрыт после простоя (${Math.round(ms / 60_000)} мин)`);
    w.kill();
  }, ms);
  idleTimer.unref();
}

function getWorker(): ChildProcess | null {
  if (worker) return worker;
  if (process.env.PDF_WORKER === "off" || !existsSync(WORKER_FILE)) return null;
  // fork — через Reflect: увидев прямой вызов с путём, сборщик Next пытается проследить файл сам.
  // Файл воркера собирает scripts/build-pdf-worker.mjs. serialization "advanced" передаёт PDF (Uint8Array) без JSON.
  const w: ChildProcess = Reflect.apply(Reflect.get(childProcess, "fork") as typeof childProcess.fork, childProcess, [
    WORKER_FILE,
    [],
    // NODE_ENV — всегда production: файл воркера есть только в собранном релизе, а там нет отладочных сборок react
    // (разовый скрипт без NODE_ENV ронял вёрстку: «Cannot find module react-jsx-runtime.development.js»).
    { execArgv: [`--max-old-space-size=${pdfWorkerHeapMb()}`], env: { ...process.env, NODE_ENV: "production" }, serialization: "advanced", stdio: ["ignore", "inherit", "inherit", "ipc"] },
  ]);
  w.on("message", (m: { id: number; ok?: boolean; result?: unknown; error?: string; progress?: RenderEvent; perf?: Record<string, number> }) => {
    const p = pending.get(m.id);
    if (!p) return;
    // Ход работы: задача ещё идёт, ответ будет позже.
    if (m.progress) {
      p.report?.(m.progress);
      return;
    }
    pending.delete(m.id);
    if (m.perf && p.meta) p.meta.perf = m.perf;
    if (m.ok) p.resolve(m.result);
    else p.reject(new Error(`PDF: ${m.error}`));
    if (!pending.size) armIdleTimer(w);
  });
  w.on("error", (err) => {
    console.error("[pdf-worker]", err);
    if (worker === w) worker = null;
    failAll(err instanceof Error ? err : new Error(String(err)));
  });
  w.on("exit", (code, signal) => {
    if (worker === w) {
      worker = null;
      stopIdleTimer();
    }
    // SIGKILL без нашего kill — почти всегда OOM-killer: на сервере кончилась память.
    const why = signal === "SIGKILL" ? " (killed: out of memory?)" : code === 134 || signal === "SIGABRT" ? " (out of memory: heap limit)" : "";
    if (pending.size) {
      console.error(`[pdf-worker] процесс вёрстки PDF завершился: code ${code}, signal ${signal}${why}`);
      failAll(new Error(`PDF worker exited with code ${code}, signal ${signal}${why}`));
    }
  });
  console.log(`[pdf-worker] процесс вёрстки PDF запущен (${path.basename(WORKER_FILE)}, pid ${w.pid}, куча до ${pdfWorkerHeapMb()} МБ)`);
  hold(w, false);
  worker = w;
  return w;
}

/**
 * Выполнить задачу вёрстки в процессе PDF (или в текущем, если воркера нет). report получает начало этапов работы.
 * Название прежнее (inPdfThread): им пользуются адаптеры производства.
 */
export async function inPdfThread<T extends PdfTask>(job: T, report?: RenderReport): Promise<PdfTaskResult<T>> {
  const t0 = performance.now();
  const meta: PdfMeta = { waitMs: 0 };
  const inline = !getWorker();
  try {
    const result = inline
      ? ((await runPdfTask(job, report)) as PdfTaskResult<T>)
      : await (HEAVY.has(job.task) ? oneOnServer(() => send(job, report, meta), meta) : send(job, report, meta));
    logPdfTask(job, t0, meta, inline, result, null);
    return result;
  } catch (err) {
    logPdfTask(job, t0, meta, inline, null, err);
    throw err;
  }
}

/** Байт в результате вёрстки: у пакета — блок, обложка и каркас; у экранной сборки — её PDF. */
function resultBytes(result: unknown): number {
  if (result instanceof Uint8Array) return result.byteLength;
  if (!result || typeof result !== "object") return 0;
  return Object.values(result).reduce<number>((sum, v) => sum + (v instanceof Uint8Array ? v.byteLength : 0), 0);
}

/**
 * Строка журнала замеров (G1): задача, книга, всё время (с ожиданием замка), время самой вёрстки и память процесса
 * вёрстки; без процесса (next dev, скрипты) — память текущего.
 */
function logPdfTask(job: PdfTask, t0: number, meta: PdfMeta, inline: boolean, result: unknown, err: unknown) {
  const bundle = "bundle" in job ? job.bundle : null;
  const pages = result && typeof result === "object" && "pageCount" in result ? Number(result.pageCount) : undefined;
  perfLog("pdf", {
    task: job.task,
    ...(bundle ? { bookId: bundle.book.id, photos: bundle.photos.length } : {}),
    ...(pages ? { pages } : {}),
    ms: Math.round(performance.now() - t0),
    waitMs: meta.waitMs,
    outMb: Math.round((resultBytes(result) / 1048576) * 10) / 10,
    ok: !err,
    ...(err ? { error: String(err instanceof Error ? err.message : err).slice(0, 200) } : {}),
    where: inline ? "inline" : "pdf-worker",
    ...(inline ? memorySnapshot() : (meta.perf ?? {})),
  });
}

/**
 * Печатный пакет и читательская версия — самые тяжёлые сборки (вся книга с фото в полном разрешении). Сайт и
 * mybook-worker верстают каждый в своём процессе, и после оплаты оба могли собирать одну книгу одновременно (17.11:
 * прогрев в mybook-worker и запрос из CRM) — две копии по 2+ ГБ на сервере с 8 ГБ. Такие сборки идут по одной
 * на весь сервер: замок в Postgres, который сам снимается, если процесс упал.
 */
const HEAVY = new Set<PdfTask["task"]>(["printPackage", "reading"]);
const HEAVY_LOCK_ID = 7_310_490;

async function oneOnServer<T>(fn: () => Promise<T>, meta?: PdfMeta): Promise<T> {
  let client: { query(sql: string, params: unknown[]): Promise<unknown>; release(): void } | undefined;
  const t0 = performance.now();
  try {
    const { pool } = await import("@/shared/infrastructure/db");
    client = await pool.connect();
    await client.query("select pg_advisory_lock($1)", [HEAVY_LOCK_ID]);
    if (meta) meta.waitMs = Math.round(performance.now() - t0);
  } catch (err) {
    // Нет базы — собираем без замка: лучше рискнуть памятью, чем не отдать файлы.
    console.error("[pdf-worker] замок сборки недоступен, собираю без него", err);
    client?.release();
    client = undefined;
  }
  try {
    return await fn();
  } finally {
    if (client) {
      await client.query("select pg_advisory_unlock($1)", [HEAVY_LOCK_ID]).catch(() => {});
      client.release();
    }
  }
}

function send<T extends PdfTask>(job: T, report?: RenderReport, meta?: PdfMeta): Promise<PdfTaskResult<T>> {
  // Процесс мог закрыться, пока задача ждала замок: getWorker поднимет новый.
  const w = getWorker();
  if (!w) return runPdfTask(job, report) as Promise<PdfTaskResult<T>>;
  stopIdleTimer();
  hold(w, true);
  const id = ++seq;
  return new Promise<PdfTaskResult<T>>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, report, meta });
    w.send({ id, job }, (err) => {
      if (!err) return;
      pending.delete(id);
      reject(err);
      if (!pending.size && worker === w) armIdleTimer(w);
    });
  });
}
