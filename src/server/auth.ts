import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { lredirect } from "@/i18n/server";
import { isSecureCookie } from "@/config/env";
import { signValue, verifySigned } from "@/shared/crypto";
import type { CurrentUser } from "@/modules/identity";
import { fromWebSessionUser, localLogout, localSessionUserDto } from "./v1-local-bridge";
import { v1WebAction, v1WebRead, webUseApiV1 } from "./v1-web-client";
import { legacyRequestContext } from "./request-context";

/**
 * Веб-адаптер аутентификации: cookie сессии и «билета» второго фактора, текущий пользователь.
 * Бизнес-логика входа — в IdentityModule; в режиме API v1 ходит в `meWebSession` / `authLogout`.
 */
const SESSION_COOKIE = "mb_session";
const TICKET_COOKIE = "mb_2fa";
const TICKET_TTL_MS = 5 * 60_000;

export type { CurrentUser as User } from "@/modules/identity";

/** Токен сессии: cookie браузера, а у мобильного приложения — заголовок Authorization: Bearer (тот же токен из таблицы sessions). */
export async function sessionToken(): Promise<string | null> {
  const ctx = legacyRequestContext();
  if (ctx) return ctx.token;
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  if (cookie) return cookie;
  const bearer = (await headers()).get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{20,200})$/);
  return bearer ? bearer[1] : null;
}

export async function startSession(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: isSecureCookie, path: "/", expires: expiresAt });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await v1WebAction({
      section: "cabinet",
      sessionCookie: token,
      viaApi: async (api) => {
        await api.authLogout({}).catch(() => {});
      },
      local: () => localLogout(token),
    });
  }
  jar.delete(SESSION_COOKIE);
}

/** Текущий пользователь (кэш на запрос). Активность для CRM отмечаем не чаще раза в 10 минут. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const ctx = legacyRequestContext();
  if (ctx) return ctx.user;
  const token = await sessionToken();
  if (!token) return null;
  const dto = await v1WebRead({
    name: "cabinet.session",
    section: "cabinet",
    sessionCookie: token,
    local: () => localSessionUserDto(token),
    viaApi: async (api) => (await api.meWebSession({})).user,
  });
  return dto ? fromWebSessionUser(dto) : null;
});

export async function requireUser(next?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) return lredirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return user;
}

/** Действующий сотрудник: роль admin и не отключён. Права внутри CRM — в server/access. */
export function isStaff(user: Pick<CurrentUser, "role" | "staffDisabled"> | null | undefined) {
  return !!user && user.role === "admin" && !user.staffDisabled;
}

export { safeNextPath } from "@/modules/identity/domain/redirects";

// ─── билет второго фактора ─────────────────────────────────────────────────

/** Положить готовый подписанный «билет» второго фактора (из API v1 или локально) в httpOnly cookie на 5 минут. */
export async function setTwoFactorTicket(signed: string) {
  (await cookies()).set(TICKET_COOKIE, signed, { httpOnly: true, sameSite: "lax", secure: isSecureCookie, path: "/", maxAge: TICKET_TTL_MS / 1000 });
}

/** После верного пароля: «билет» на 5 минут, чтобы ввести код 2FA. Без него сессия не создаётся. */
export async function issueTwoFactorTicket(userId: string) {
  const exp = Date.now() + TICKET_TTL_MS;
  await setTwoFactorTicket(signValue(`${userId}.${exp}`));
}

/** Исходная строка подписанного билета из cookie (для отправки в `authSecondFactor` API v1). */
export async function rawTwoFactorTicket(): Promise<string | null> {
  return (await cookies()).get(TICKET_COOKIE)?.value ?? null;
}

export async function readTwoFactorTicket(): Promise<string | null> {
  const raw = await rawTwoFactorTicket();
  const data = raw ? verifySigned(raw) : null;
  if (!data) return null;
  const [userId, exp] = data.split(".");
  return Number(exp) > Date.now() ? userId : null;
}

/** Есть ли билет 2FA: в API-режиме (в т.ч. Vercel без APP_SECRET/DATABASE_URL) проверяем наличие cookie (подпись проверит mybook-api). */
export async function hasTwoFactorTicket(): Promise<boolean> {
  if (webUseApiV1("cabinet")) return Boolean(await rawTwoFactorTicket());
  return Boolean(await readTwoFactorTicket());
}

export async function clearTwoFactorTicket() {
  (await cookies()).delete(TICKET_COOKIE);
}
