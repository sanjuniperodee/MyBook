import { Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";
import { originAllowed } from "@/shared/origin";
import { APP_CONFIG, type AppConfig } from "../config/app-config";
import { ApiError } from "../errors/api-error";
import { contractRouteOf, PUBLIC_ROUTE } from "../http/endpoint";
import { header } from "../http/request";
import { siteRouteOf } from "../http/site-route";
import { SESSION_USERS, sessionToken, type SessionUsers } from "./session";

/**
 * Вход по контракту или @SiteRoute (глобальный guard):
 * - auth "none" — без входа (CSRF проверяется только при явном csrf: true на @SiteRoute),
 * - auth "user" | "staff" — Origin (CSRF, если не отключён) и сессия, иначе 401.
 * Маршрут без @Endpoint/@SiteRoute открыт только с @Public() — по умолчанию закрыто.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(SESSION_USERS) private readonly sessions: SessionUsers,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const handler = ctx.getHandler();
    const contract = contractRouteOf(this.reflector, handler);
    const site = contract ? undefined : siteRouteOf(this.reflector, handler);
    if (!contract && !site) {
      if (this.reflector.get<boolean>(PUBLIC_ROUTE, handler)) return true;
      throw new ApiError(403, "forbidden");
    }
    const auth = contract ? contract.def.auth : site!.options.auth;
    const checkCsrf = contract ? auth !== "none" : (site!.options.csrf ?? auth !== "none");
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    if (checkCsrf) {
      const host = header(req, "x-forwarded-host") ?? header(req, "host");
      if (!originAllowed({ method: req.method, origin: header(req, "origin"), host }, this.config.appUrl)) throw new ApiError(403, "forbidden");
    }
    if (auth === "none") return true;
    const token = sessionToken(req);
    const user = token ? await this.sessions.user(token) : null;
    if (!user) throw new ApiError(401, "unauthorized");
    req.user = user;
    return true;
  }
}
