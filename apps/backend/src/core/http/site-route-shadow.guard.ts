import { Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";
import { SiteMethodNotAllowed } from "./site-method-not-allowed";
import { SITE_ROUTE_REGISTRY, siteRouteOf, type SiteRouteRegistry } from "./site-route";

/**
 * Fastify, не найдя метода у статического пути, отдаёт запрос шаблону с параметром: `POST …/calls/whatsapp/live` уходит
 * в `POST …/calls/whatsapp/{id}`. У mybook-api и Next.js выбор шаблона окончателен — там это 405 с Allow маршрута
 * `…/live`. Guard идёт первым и возвращает то же: обработчик менее точного шаблона не вызывается.
 */
@Injectable()
export class SiteRouteShadowGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(SITE_ROUTE_REGISTRY) private readonly siteRoutes: SiteRouteRegistry,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const site = siteRouteOf(this.reflector, ctx.getHandler());
    if (!site) return true;
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const best = this.siteRoutes.best(req.url.split("?")[0]);
    if (best && best.path !== site.path && !best.methods.includes(site.method)) throw new SiteMethodNotAllowed(best.methods);
    return true;
  }
}
