import { AsyncLocalStorage } from "node:async_hooks";
import type { Locale } from "@/i18n/config";
import { runWithLocale } from "@/i18n/server";
import type { StaffGate } from "@/modules/access";
import type { CurrentUser } from "@/modules/identity";
import type { Staff } from "./access";

/**
 * Контекст HTTP-запроса для переходного слоя NestJS (`apps/backend/src/legacy/*`):
 * передаёт уже проверенные NestJS-гардами сессию, сотрудника, IP и язык в общие серверные модули
 * (`auth`, `access`, `rateLimit`, `crm-actions`, `crm-ops`) без единого обращения к `next/headers`.
 */
export interface LegacyRequestContext {
  token: string | null;
  user: CurrentUser | null;
  staff: Staff | null;
  gate: StaffGate;
  ip: string;
}

const storage = new AsyncLocalStorage<LegacyRequestContext>();

/** Текущий явный контекст запроса NestJS, если вызов идёт из `runWithLegacyRequest`. */
export function legacyRequestContext(): LegacyRequestContext | undefined {
  return storage.getStore();
}

/** Выполнить `fn` с явным контекстом пользователя/сотрудника/IP/языка без обращения к `next/headers`. */
export function runWithLegacyRequest<T>(ctx: LegacyRequestContext & { locale: Locale }, fn: () => T): T {
  return runWithLocale(ctx.locale, () => storage.run(ctx, fn));
}
