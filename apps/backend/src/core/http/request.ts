import type { FastifyRequest } from "fastify";
import type { CurrentUser } from "@/modules/identity";
import { defaultLocale, isLocale, LOCALE_COOKIE, LOCALE_HEADER, type Locale } from "@/i18n/config";
import type { StaffMember } from "../auth/staff";

declare module "fastify" {
  interface FastifyRequest {
    /** Кто вошёл — кладёт SessionGuard у маршрутов с auth: user | staff. */
    user?: CurrentUser;
    /** Сотрудник CRM с правами — кладёт StaffGuard у маршрутов с auth: staff. */
    staff?: StaffMember;
    /** Вход маршрута, разобранный схемами контракта, — кладёт ContractInputGuard. */
    contractInput?: unknown;
  }
}

/** Значение одного заголовка (повторённый — последний). */
export function header(req: FastifyRequest, name: string): string | null {
  const v = req.headers[name.toLowerCase()];
  return (Array.isArray(v) ? v.at(-1) : v) ?? null;
}

/** Значение cookie без отдельного плагина: бэкенду нужны две — сессия и язык. */
export function cookie(req: FastifyRequest, name: string): string | null {
  for (const part of header(req, "cookie")?.split(";") ?? []) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

/** Язык запроса — как у сайта (src/i18n/server.ts): заголовок фронта, иначе выбор в cookie, иначе русский. */
export function requestLocale(req: FastifyRequest): Locale {
  const h = header(req, LOCALE_HEADER);
  if (isLocale(h)) return h;
  const c = cookie(req, LOCALE_COOKIE);
  return isLocale(c) ? c : defaultLocale;
}
