import type { Locale } from "@/i18n/config";
import type { StaffGate } from "@/modules/access";
import type { CurrentUser } from "@/modules/identity";
import type { Staff } from "@/server/access";
import { runWithLegacyRequest } from "@/server/request-context";
import type { StaffMember } from "../core/auth/staff";

/** Приводит проверенного StaffGuard сотрудника к типу `Staff` из `src/server/access.ts`. */
export function toLegacyStaff(member: StaffMember): Staff {
  return {
    user: member.user,
    roleName: member.roleName,
    roleKey: member.roleKey,
    scope: member.scope,
    permissions: member.permissions,
    isOwner: member.isOwner,
    context: member.context,
  };
}

export interface LegacyCallContext {
  token?: string | null;
  user?: CurrentUser | null;
  staff?: StaffMember | null;
  gate?: StaffGate;
  ip?: string;
  locale?: Locale;
}

/**
 * Выполнить вызов старого серверного действия/сборщика (`crm-actions`, `crm-ops`, `site-handlers`)
 * в контексте текущего запроса NestJS без единого обращения к `next/headers`.
 */
export function runInLegacyRequest<T>(ctx: LegacyCallContext, fn: () => T): T {
  const staff = ctx.staff ?? null;
  return runWithLegacyRequest(
    {
      token: ctx.token ?? null,
      user: ctx.user ?? staff?.user ?? null,
      staff: staff ? toLegacyStaff(staff) : null,
      gate: ctx.gate ?? staff?.gate ?? null,
      ip: ctx.ip ?? "unknown",
      locale: ctx.locale ?? "ru",
    },
    fn,
  );
}
