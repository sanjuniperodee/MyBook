/**
 * Процесс mybook-worker: фоновая работа отдельно от обработки запросов (ADR 0009) — прежний вход (worker.mjs).
 * С ADR 0014 (шаг 6) по умолчанию тот же фон запускает бэкенд на Nest (backend-worker.mjs); этот вход — запасной:
 * `echo legacy > ~/mybook-flags/worker-runtime` (deploy/ecosystem.config.cjs). Работа — общая, src/worker/run.ts.
 */
import { prepareWorker, startWorkerJobs, waitForMigrations } from "./run";

export { migrationsState } from "./run";

async function main() {
  await prepareWorker();
  await waitForMigrations();
  await startWorkerJobs();
  console.log(`[worker] background jobs started (pid ${process.pid})`);
}

// Таймеры фона сделаны unref (чтобы не держать сайт при остановке); здесь процесс живёт ради них, поэтому держим его сами.
const keepAlive = setInterval(() => {}, 1 << 30);
const stop = (signal: string) => {
  console.log(`[worker] ${signal}, stopping`);
  clearInterval(keepAlive);
  // Текущий проход дописывается за секунды; PM2 добьёт по kill_timeout.
  setTimeout(() => process.exit(0), 2_000).unref();
};
process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));

main().catch((err) => {
  console.error("[worker] failed to start", err);
  process.exit(1);
});
