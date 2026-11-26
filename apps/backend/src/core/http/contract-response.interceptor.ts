import { createHash } from "node:crypto";
import { Inject, Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyReply, FastifyRequest } from "fastify";
import { map } from "rxjs";
import { APP_CONFIG, type AppConfig } from "../config/app-config";
import { contractRouteOf } from "./endpoint";
import { header } from "./request";

/**
 * Ответ маршрута по контракту: вне прода сверяется со схемой ответа (расхождение — 500 и падение теста), кэш-заголовки —
 * как у mybook-api: GET с ETag (приложение шлёт If-None-Match и при тех же данных получает пустой 304), остальное — no-store.
 */
@Injectable()
export class ContractResponseInterceptor implements NestInterceptor {
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
    return next.handle().pipe(
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
