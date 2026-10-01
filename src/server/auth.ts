import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { lredirect } from "@/i18n/server";
import { isSecureCookie } from "@/config/env";
import { signValue, verifySigned } from "@/shared/crypto";
import type { CurrentUser } from "@/modules/identity";
import { container } from "./container";

/**
 * Веб-адаптер аутентификации: cookie сессии и «билета» второго фактора, текущий пользователь.
 * Бизнес-логика входа — в IdentityModule; здесь только HTTP.
 */
const SESSION_COOKIE = "mb_session";
const TICKET_COOKIE = "mb_2fa";
const TICKET_TTL_MS = 5 * 60_000;

export type { CurrentUser as User } from "@/modules/identity";

export async function sessionToken(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

export async function startSession(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: isSecureCookie, path: "/", expires: expiresAt });
}

export async function destroySession() {
  const jar = await cookies();
  await container().identity.auth.logout(jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
}

/** Текущий пользователь (кэш на запрос). Активность для CRM отмечаем не чаще раза в 10 минут. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = await sessionToken();
  if (!token) return null;
  const identity = container().identity;
  const now = new Date();
  const user = await identity.queries.userBySession(identity.tokens.hash(token), now);
  if (user && (!user.lastSeenAt || now.getTime() - user.lastSeenAt.getTime() > 10 * 60_000)) void identity.queries.touch(user.id, now).catch(() => {});
  return user;
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

/** После верного пароля: «билет» на 5 минут, чтобы ввести код 2FA. Без него сессия не создаётся. */
export async function issueTwoFactorTicket(userId: string) {
  const exp = Date.now() + TICKET_TTL_MS;
  (await cookies()).set(TICKET_COOKIE, signValue(`${userId}.${exp}`), { httpOnly: true, sameSite: "lax", secure: isSecureCookie, path: "/", maxAge: TICKET_TTL_MS / 1000 });
}

export async function readTwoFactorTicket(): Promise<string | null> {
  const raw = (await cookies()).get(TICKET_COOKIE)?.value;
  const data = raw ? verifySigned(raw) : null;
  if (!data) return null;
  const [userId, exp] = data.split(".");
  return Number(exp) > Date.now() ? userId : null;
}

export async function clearTwoFactorTicket() {
  (await cookies()).delete(TICKET_COOKIE);
}
