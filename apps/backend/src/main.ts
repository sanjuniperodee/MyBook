/**
 * Процесс mybook-backend (ADR 0014): API v1 на NestJS + Fastify. Переезжает с mybook-api по контекстам — nginx
 * направляет сюда префиксы перенесённых контекстов. Миграции БД запускает mybook-api; фоновых проходов здесь нет.
 */
import "reflect-metadata";
import { ConsoleLogger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";
import { configureApp, createAdapter } from "./bootstrap";
import { APP_CONFIG, type AppConfig } from "./core/config/app-config";

// Журнал PM2 — без цветовых кодов; в терминале разработчика — с ними.
const logger = new ConsoleLogger({ colors: !!process.stdout.isTTY, logLevels: ["error", "warn", "log"] });
const app = await configureApp(await NestFactory.create<NestFastifyApplication>(AppModule, createAdapter(), { logger }));
const config = app.get<AppConfig>(APP_CONFIG);
await app.listen(config.port, config.host);
console.log(`[backend] на ${config.host}:${config.port} (pid ${process.pid})`);
