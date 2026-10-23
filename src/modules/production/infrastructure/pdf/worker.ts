/**
 * Поток вёрстки PDF (worker_threads): собирается отдельным файлом pdf-worker.mjs рядом с server.js
 * (scripts/build-pdf-worker.mjs) и выполняет задачи из worker-tasks.ts по одной, пока основной поток отвечает сайту.
 */
import { parentPort } from "node:worker_threads";
import { runPdfTask, type PdfTask } from "./worker-tasks";

if (!parentPort) throw new Error("pdf-worker must run as a worker thread");
const port = parentPort;

port.on("message", async (msg: { id: number; job: PdfTask }) => {
  try {
    // Ход работы — отдельными сообщениями с тем же id: ответ придёт после них.
    const result = await runPdfTask(msg.job, (progress) => port.postMessage({ id: msg.id, progress }));
    port.postMessage({ id: msg.id, ok: true, result });
  } catch (err) {
    port.postMessage({ id: msg.id, ok: false, error: err instanceof Error ? (err.stack ?? err.message) : String(err) });
  }
});
