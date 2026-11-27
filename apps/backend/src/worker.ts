/**
 * Процесс mybook-worker на Nest (ADR 0014, шаг 6): фоновая работа — standalone-приложение (без HTTP) с модулем
 * WorkerModule. Собирается scripts/build-backend-worker.mjs в .next/standalone/backend-worker.mjs; PM2 запускает его
 * вместо worker.mjs (deploy/ecosystem.config.cjs; откат без выкатки — `echo legacy > ~/mybook-flags/worker-runtime`).
 */
import "reflect-metadata";
import { ConsoleLogger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { WorkerModule } from "./worker/worker.module";

// Журнал PM2 — без цветовых кодов; в терминале разработчика — с ними.
const logger = new ConsoleLogger({ colors: !!process.stdout.isTTY, logLevels: ["error", "warn", "log"] });
try {
  const app = await NestFactory.createApplicationContext(WorkerModule, { logger });
  // SIGTERM/SIGINT от PM2 → onApplicationShutdown (BackgroundRunner).
  app.enableShutdownHooks();
} catch (err) {
  console.error("[worker] failed to start", err);
  process.exit(1);
}
