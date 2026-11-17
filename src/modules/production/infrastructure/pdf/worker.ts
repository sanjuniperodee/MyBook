/**
 * Процесс вёрстки PDF (child_process.fork из pdf/pool.ts): собирается отдельным файлом pdf-worker.mjs рядом с server.js
 * (scripts/build-pdf-worker.mjs) и выполняет задачи из worker-tasks.ts по одной, пока сайт отвечает своим процессом.
 */
import { writeFileSync } from "node:fs";
import { configureSharpMemory } from "@/shared/infrastructure/sharpMemory";
import { runPdfTask, type PdfTask } from "./worker-tasks";

const ipc = process.send?.bind(process);
if (!ipc) throw new Error("pdf-worker must run as a child process with an IPC channel");
/** Ответ родителю; канал закрыт — родителя нет, отвечать некому (без этого send бросал бы ERR_IPC_CHANNEL_CLOSED). */
const send = (msg: unknown) => {
  if (process.connected) ipc(msg);
};

// Не хватит памяти на сервере — пусть ядро (OOM-killer) убьёт сначала вёрстку, а не сайт или базу. Только Linux.
try {
  writeFileSync("/proc/self/oom_score_adj", "900");
} catch {
  // не Linux или нет прав — не важно
}
// Сайт закрылся (выкатка, перезапуск PM2) — вёрстка без него не нужна. disconnect приходит не всегда (17.11: после
// гибели родителя процесс остался сиротой и верстал дальше), поэтому ещё и проверка раз в 5 с: канал закрыт или
// родитель сменился на init — выходим. Проверка срабатывает между шагами вёрстки (синхронный проход её откладывает).
process.on("disconnect", () => process.exit(0));
const parent = process.ppid;
setInterval(() => {
  if (!process.connected || process.ppid !== parent) process.exit(0);
}, 5_000).unref();

// Процесс заново грузит sharp, и его загрузка снова включает кэш libvips (ADR 0010).
const ready = configureSharpMemory().catch((err) => console.error("[pdf-worker] sharp memory", err));

process.on("message", async (msg: { id: number; job: PdfTask }) => {
  await ready;
  try {
    // Ход работы — отдельными сообщениями с тем же id: ответ придёт после них.
    const result = await runPdfTask(msg.job, (progress) => send({ id: msg.id, progress }));
    send({ id: msg.id, ok: true, result });
  } catch (err) {
    send({ id: msg.id, ok: false, error: err instanceof Error ? (err.stack ?? err.message) : String(err) });
  }
});
