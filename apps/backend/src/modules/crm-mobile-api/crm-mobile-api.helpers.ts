import type { FastifyRequest } from "fastify";
import type { Locale } from "@/i18n/config";
import type { StaffMember } from "../../core/auth/staff";
import type { AppConfig } from "../../core/config/app-config";
import { clientIp } from "../../core/http/client-ip";
import type { CrmRequestContext } from "./crm-mobile-api.tokens";

/** Отказ действия CRM (чужая запись, лимит скидки, пустая запись и т.п.) — 400 с текстом для сотрудника. */
export const refused = (message: string): Response =>
  Response.json({ error: message, code: "refused" }, { status: 400, headers: { "cache-control": "no-store" } });

/** Стандартный ответ действия: ошибка → 400 refused, иначе `{ ok: true }`. */
export const okOrRefused = (result: { error?: string }): { ok: true } | Response =>
  result.error ? refused(result.error) : { ok: true };

/** Извлекает id созданной сущности из Next.js redirect-исключения (`NEXT_REDIRECT;...;/admin/deals/<id>`). */
export function redirectId(err: unknown): string | null {
  if (typeof err !== "object" || err === null) return null;
  const digest: unknown = Reflect.get(err, "digest");
  if (typeof digest !== "string" || !digest.startsWith("NEXT_REDIRECT")) return null;
  return digest.split(";")[2]?.split("/").pop() || null;
}

/** Собирает явный контекст запроса сотрудника для вызовов переходного слоя legacy. */
export function callContext(
  req: FastifyRequest,
  config: AppConfig,
  staff: StaffMember,
  token: string | null,
  locale: Locale,
): CrmRequestContext {
  return {
    staff,
    token,
    ip: clientIp(req, config.edgeIpSecret),
    locale,
  };
}
