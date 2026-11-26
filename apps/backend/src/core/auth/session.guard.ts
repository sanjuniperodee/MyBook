import { Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";
import { originAllowed } from "@/shared/origin";
import { APP_CONFIG, type AppConfig } from "../config/app-config";
import { ApiError } from "../errors/api-error";
import { contractRouteOf, PUBLIC_ROUTE } from "../http/endpoint";
import { header } from "../http/request";
import { SESSION_USERS, sessionToken, type SessionUsers } from "./session";

/**
 * Вход по контракту маршрута (глобальный guard): auth "none" — без входа, "user" — Origin (CSRF) и сессия, иначе 401.
 * Маршрут без контракта открыт только с @Public() — по умолчанию закрыто, забытая проверка не открывает данные.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(SESSION_USERS) private readonly sessions: SessionUsers,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const route = contractRouteOf(this.reflector, ctx.getHandler());
    if (!route) {
      if (this.reflector.get<boolean>(PUBLIC_ROUTE, ctx.getHandler())) return true;
      throw new ApiError(403, "forbidden");
    }
    if (route.def.auth === "none") return true;
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const host = header(req, "x-forwarded-host") ?? header(req, "host");
    if (!originAllowed({ method: req.method, origin: header(req, "origin"), host }, this.config.appUrl)) throw new ApiError(403, "forbidden");
    const token = sessionToken(req);
    const user = token ? await this.sessions.user(token) : null;
    if (!user) throw new ApiError(401, "unauthorized");
    req.user = user;
    return true;
  }
}
