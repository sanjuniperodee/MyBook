import { createParamDecorator, SetMetadata, type ExecutionContext } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { Permission } from "@/shared/domain/permissions";
import type { StaffMember } from "./staff";

export const PERMISSIONS_KEY = Symbol("staffPermissions");
export const ALLOW_UNCONFIGURED_2FA_KEY = Symbol("allowUnconfigured2fa");

/** Требует у сотрудника все указанные права (проверяется PermissionsGuard после разбора входа). */
export const Permissions = (...perms: Permission[]) => SetMetadata(PERMISSIONS_KEY, perms);

/**
 * Разрешает маршрут сотруднику, которому осталось только настроить обязательную 2FA (паритет с assertStaffShell
 * в src/server/access.ts — например, экраны настройки собственной 2FA). Вход с чужого IP по-прежнему запрещён.
 */
export const AllowUnconfigured2fa = () => SetMetadata(ALLOW_UNCONFIGURED_2FA_KEY, true);

/** Авторизованный сотрудник CRM из запроса (его кладёт StaffGuard для маршрутов с auth: staff). */
export const CurrentStaff = createParamDecorator((_: unknown, ctx: ExecutionContext): StaffMember => {
  const staff = ctx.switchToHttp().getRequest<FastifyRequest>().staff;
  if (!staff) throw new Error("CurrentStaff: маршрут без auth: staff");
  return staff;
});
