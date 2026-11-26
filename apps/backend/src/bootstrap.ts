import "reflect-metadata";
import multipart from "@fastify/multipart";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { ROUTE_REGISTRY, type RouteRegistry } from "./core/routes/route-registry";

/** Файлы — до 64 МБ (фото отзыва ограничивает сам контекст, 15 МБ), JSON — до 10 МБ. */
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const MAX_JSON_BYTES = 10 * 1024 * 1024;

/** Fastify процесса. Keep-alive дольше, чем у nginx (60 с): соединение закрывает прокси, а не сервис посреди запроса. */
export const createAdapter = () => new FastifyAdapter({ bodyLimit: MAX_JSON_BYTES, keepAliveTimeout: 65_000 });

/** Одна настройка приложения для запуска (main.ts) и тестов (Test.createTestingModule → createNestApplication). */
export async function configureApp(app: NestFastifyApplication): Promise<NestFastifyApplication> {
  // Маршруты регистрируются при init() — после этого хука: реестр видит все адреса процесса.
  const registry = app.get<RouteRegistry>(ROUTE_REGISTRY);
  app.getHttpAdapter().getInstance().addHook("onRoute", (r) => registry.add(r.method, r.url));
  await app.register(multipart, { limits: { fileSize: MAX_FILE_BYTES, files: 10 } });
  app.enableShutdownHooks();
  return app;
}
