import "reflect-metadata";
import multipart from "@fastify/multipart";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import type { FastifyInstance } from "fastify";
import { ROUTE_REGISTRY, type RouteRegistry } from "./core/routes/route-registry";

/** Файлы — до 64 МБ (фото отзыва ограничивает сам контекст, 15 МБ), JSON — до 10 МБ. */
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const MAX_JSON_BYTES = 10 * 1024 * 1024;

const isSitePath = (url: string) => {
  const path = url.split("?")[0];
  return !path.startsWith("/api/v1/") || path.startsWith("/api/v1/site/");
};

const badBodyError = (message: string) => Object.assign(new SyntaxError(message), { statusCode: 400 });

/** Сохраняем сырое тело (для HMAC-подписей вебхуков); на маршрутах сайта битый JSON не роняем здесь — формат ошибки свой. */
function registerRawBodyParsers(fastify: FastifyInstance) {
  for (const type of ["application/json", "text/plain", "application/x-www-form-urlencoded"]) {
    if (fastify.hasContentTypeParser(type)) fastify.removeContentTypeParser(type);
  }
  fastify.addContentTypeParser("application/json", { parseAs: "buffer" }, (req, body, done) => {
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
    req.rawBody = buf;
    const site = isSitePath(req.url);
    if (buf.length === 0) return void done(site ? null : badBodyError("Empty JSON body"), undefined);
    try {
      done(null, JSON.parse(buf.toString("utf8")));
    } catch (err) {
      if (site) return void done(null, undefined);
      done(Object.assign(err instanceof Error ? err : new SyntaxError("Invalid JSON"), { statusCode: 400 }), undefined);
    }
  });
  fastify.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "buffer" }, (req, body, done) => {
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
    req.rawBody = buf;
    done(null, Object.fromEntries(new URLSearchParams(buf.toString("utf8"))));
  });
  fastify.addContentTypeParser("text/plain", { parseAs: "buffer" }, (req, body, done) => {
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
    req.rawBody = buf;
    done(null, buf.toString("utf8"));
  });
}

class MyBookFastifyAdapter extends FastifyAdapter {
  /** Заменяем стандартные парсеры Nest/Fastify на наши, сохраняющие req.rawBody для вебхуков. */
  override registerParserMiddleware() {
    registerRawBodyParsers(this.getInstance());
  }
}

/** Fastify процесса. Keep-alive дольше, чем у nginx (60 с): соединение закрывает прокси, а не сервис посреди запроса. */
export const createAdapter = () => new MyBookFastifyAdapter({ bodyLimit: MAX_JSON_BYTES, keepAliveTimeout: 65_000 });

/** Одна настройка приложения для запуска (main.ts) и тестов (Test.createTestingModule → createNestApplication). */
export async function configureApp(app: NestFastifyApplication): Promise<NestFastifyApplication> {
  // Маршруты регистрируются при init() — после этого хука: реестр видит все адреса процесса.
  const registry = app.get<RouteRegistry>(ROUTE_REGISTRY);
  app.getHttpAdapter().getInstance().addHook("onRoute", (r) => registry.add(r.method, r.url));
  await app.register(multipart, { limits: { fileSize: MAX_FILE_BYTES, files: 10 } });
  app.enableShutdownHooks();
  return app;
}
