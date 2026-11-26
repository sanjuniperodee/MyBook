import { Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";
import { APP_CONFIG, type AppConfig } from "../config/app-config";
import { ApiError } from "../errors/api-error";
import { clientIp } from "../http/client-ip";
import { contractRouteOf } from "../http/endpoint";
import { STAFF_ACCESS, type StaffAccessPort } from "./staff";
import { ALLOW_UNCONFIGURED_2FA_KEY } from "./staff.decorators";

/**
 * Допуск сотрудника CRM (ADR 0014, правило 8): выполняется глобально сразу после SessionGuard и до
 * ContractInputGuard — проверяет роль, отключение, IP-allowlist и обязательную 2FA (паритет с apiStaff).
 */
@Injectable()
export class StaffGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(STAFF_ACCESS) private readonly access: StaffAccessPort,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const route = contractRouteOf(this.reflector, ctx.getHandler());
    if (!route || route.def.auth !== "staff") return true;
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    if (!req.user) throw new ApiError(401, "unauthorized");
    const resolved = await this.access.resolve(req.user, clientIp(req, this.config.edgeIpSecret));
    if (!resolved || resolved.gate === "ip") throw new ApiError(403, "forbidden");
    const allow2fa = this.reflector.getAllAndOverride<boolean>(ALLOW_UNCONFIGURED_2FA_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (resolved.gate === "2fa" && !allow2fa) throw new ApiError(403, "forbidden");
    const { context, gate } = resolved;
    req.staff = {
      user: req.user,
      roleName: context.roleName,
      roleKey: context.roleKey,
      scope: context.scope,
      permissions: context.permissions,
      isOwner: context.isOwner,
      context,
      gate,
    };
    return true;
  }
}
