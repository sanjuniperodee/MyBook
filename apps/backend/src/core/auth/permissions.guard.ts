import { Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";
import type { Permission } from "@/shared/domain/permissions";
import { ApiError } from "../errors/api-error";
import { PERMISSIONS_KEY } from "./staff.decorators";

/**
 * Проверка прав сотрудника по @Permissions(...) (глобально сразу после ContractInputGuard — неверная схема
 * отдаёт 400 до проверки конкретного права, как в обработчиках mybook-api).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndMerge<Permission[]>(PERMISSIONS_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!required.length) return true;
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    if (!req.staff?.context.can(...required)) throw new ApiError(403, "forbidden");
    return true;
  }
}
