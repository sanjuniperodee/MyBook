import type { FastifyRequest } from "fastify";
import type { Locale } from "@/i18n/config";
import type { StaffMember } from "../../core/auth/staff";
import type { AppConfig } from "../../core/config/app-config";
import { clientIp } from "../../core/http/client-ip";
import type { CrmAdminRequestContext } from "./crm-admin.tokens";

/** Отказ действия CRM — 400 с текстом для сотрудника и запретом кэширования. */
export const refused = (message: string): Response =>
  Response.json({ error: message, code: "refused" }, { status: 400, headers: { "cache-control": "no-store" } });

/** Успешный ответ мутации по схеме контракта Done. */
export const done = (message: string | null): { ok: true; message: string | null } => ({ ok: true, message });

/** Собирает явный контекст запроса сотрудника для вызовов переходного слоя legacy. */
export function callContext(
  req: FastifyRequest,
  config: AppConfig,
  staff: StaffMember,
  token: string | null,
  locale: Locale,
): CrmAdminRequestContext {
  return {
    staff,
    token,
    ip: clientIp(req, config.edgeIpSecret),
    locale,
  };
}
