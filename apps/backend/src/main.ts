/**
 * Процесс mybook-backend (ADR 0014): весь бэкенд MyBooks на NestJS + Fastify — API v1 и маршруты сайта (с 27.11 вместо
 * mybook-api; nginx: /api/v1/ и /api/ → 3046). Применяет миграции БД до приёма запросов (SKIP_AUTO_MIGRATE=1 — без них);
 * фоновых проходов здесь нет (они в mybook-worker), кроме двух: оповещения о сбое фона («Фон и очереди») — его не может
 * вести сам воркер, — и синхронизации каталога из настроек (цены в этом процессе).
 */
import "reflect-metadata";
import { ConsoleLogger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";
import { configureApp, createAdapter } from "./bootstrap";
import { APP_CONFIG, type AppConfig } from "./core/config/app-config";
import { becomeApiProcess } from "./legacy/api-process";

becomeApiProcess();
if (process.env.SKIP_AUTO_MIGRATE !== "1") {
  const { runMigrations } = await import("@/shared/infrastructure/db/migrate");
  await runMigrations();
  console.log("[backend] database migrations applied");
}

// Цены, тарифы, флаги сайта и реквизиты из настроек CRM («Цены и тарифы»): сразу до приёма запросов и затем раз в 10 с.
// Без этого процесс живёт на заводских ценах из src/config/site.ts (счёт в CRM показывал 30 000 ₸ вместо 39 000 ₸).
const { ensureCatalog, startCatalogSync } = await import("@/server/catalog");
await ensureCatalog();
startCatalogSync();

// Журнал PM2 — без цветовых кодов; в терминале разработчика — с ними.
const logger = new ConsoleLogger({ colors: !!process.stdout.isTTY, logLevels: ["error", "warn", "log"] });
const app = await configureApp(await NestFactory.create<NestFastifyApplication>(AppModule, createAdapter(), { logger }));
const config = app.get<AppConfig>(APP_CONFIG);
await app.listen(config.port, config.host);
console.log(`[backend] на ${config.host}:${config.port} (pid ${process.pid})`);
const { startOpsAlerts } = await import("./legacy/ops-alerts");
startOpsAlerts();
