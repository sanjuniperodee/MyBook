import { createHash } from "node:crypto";
import { Inject, Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyReply, FastifyRequest } from "fastify";
import { from, map, switchMap } from "rxjs";
import type { RouteDef } from "@mybook/contracts";
import { APP_CONFIG, type AppConfig } from "../config/app-config";
import { ApiError } from "../errors/api-error";
import { contractRouteOf } from "./endpoint";
import { header } from "./request";

/** Строка запроса как у mybook-api (Object.fromEntries(searchParams)): у повторённого ключа — последнее значение. */
const lastValues = (query: unknown) =>
  Object.fromEntries(Object.entries((query ?? {}) as Record<string, unknown>).map(([k, v]) => [k, Array.isArray(v) ? v.at(-1) : v]));

async function readFiles(req: FastifyRequest, field: string): Promise<File[]> {
  if (!req.isMultipart()) throw new ApiError(400, "badRequest");
  const files: File[] = [];
  for await (const part of req.parts()) {
    if (part.type !== "file") continue;
    // Чужое поле читается вхолостую: иначе поток запроса встанет на этой части.
    if (part.fieldname !== field) {
      part.file.resume();
      continue;
    }
    const data = await part.toBuffer();
    if (data.length > 0) files.push(new File([new Uint8Array(data)], part.filename, { type: part.mimetype }));
  }
  return files;
}

async function readInput(req: FastifyRequest, def: RouteDef): Promise<Record<string, unknown>> {
  const input: Record<string, unknown> = {};
  if (def.params) Object.assign(input, def.params.parse(req.params));
  if (def.query) Object.assign(input, def.query.parse(lastValues(req.query)));
  if (def.body) input.body = def.body.parse(req.body);
  if (def.files) input.files = await readFiles(req, def.files.field);
  return input;
}

/**
 * Вход и выход маршрута по контракту: до обработчика — разбор параметров, строки запроса, тела и файлов схемами
 * контракта (ошибка схемы — 400 через фильтр), после — сверка ответа с контрактом вне прода и кэш-заголовки:
 * GET — с ETag (приложение шлёт If-None-Match и при тех же данных получает пустой 304), остальное — no-store.
 */
@Injectable()
export class ContractInterceptor implements NestInterceptor {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler) {
    const route = contractRouteOf(this.reflector, ctx.getHandler());
    if (!route) return next.handle();
    const http = ctx.switchToHttp();
    const req = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    return from(readInput(req, route.def)).pipe(
      switchMap((input) => {
        req.contractInput = input;
        return next.handle();
      }),
      map((out: unknown) => {
        if (!this.config.production) {
          const check = route.def.response.safeParse(out);
          if (!check.success) throw new Error(`Ответ ${route.name} не по контракту: ${check.error.message}`);
        }
        if (req.method !== "GET") {
          reply.header("cache-control", "no-store");
          return out;
        }
        const tag = `"${createHash("sha1").update(JSON.stringify(out)).digest("base64url").slice(0, 27)}"`;
        reply.header("etag", tag).header("cache-control", "private, no-cache");
        if (header(req, "if-none-match") !== tag) return out;
        reply.status(304);
        return undefined;
      }),
    );
  }
}
