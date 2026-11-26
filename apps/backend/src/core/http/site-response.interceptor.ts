import { Injectable, Inject, type CallHandler, type ExecutionContext, type NestInterceptor } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { createHash } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { map } from "rxjs";
import { header } from "./request";
import { siteRouteOf } from "./site-route";

const jsonEtag = (value: unknown) => `"${createHash("sha1").update(JSON.stringify(value) ?? "null").digest("base64url").slice(0, 27)}"`;

/**
 * Пост-обработка ответов @SiteRoute:
 * - Web `Response` (потоки, 206 Range, бинарные файлы, 304, несколько Set-Cookie) отдаётся ядром NestJS 12 без буферизации.
 * - Обычный JSON на GET с `{ etag: true }` получает ETag и отдаёт 304 при совпадении If-None-Match.
 */
@Injectable()
export class SiteResponseInterceptor implements NestInterceptor {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  intercept(ctx: ExecutionContext, next: CallHandler) {
    const site = siteRouteOf(this.reflector, ctx.getHandler());
    if (!site) return next.handle();
    const http = ctx.switchToHttp();
    const req = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    return next.handle().pipe(
      map((out: unknown) => {
        if (reply.sent || out instanceof Response) return out;
        if (req.method !== "GET" || !site.options.etag) {
          if (!reply.getHeader("cache-control")) reply.header("cache-control", "no-store");
          return out;
        }
        const tag = jsonEtag(out);
        if (header(req, "if-none-match") === tag) {
          return new Response(null, { status: 304, headers: { etag: tag, "cache-control": "private, no-cache" } });
        }
        reply.header("etag", tag).header("cache-control", "private, no-cache");
        return out;
      }),
    );
  }
}
