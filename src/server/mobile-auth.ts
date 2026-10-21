import "server-only";
import { z } from "zod";
import { admin } from "@/i18n/admin";
import { HttpError } from "@/server/api";
import { container } from "@/server/container";
import { staffActionError } from "@/server/errors";
import { IdentityError } from "@/modules/identity";
import { signValue, verifySigned } from "@/shared/crypto";
import { rateLimit, trustedClientIp } from "@/server/rateLimit";

/**
 * Вход мобильного приложения продажника: тот же пароль и вторая ступень (2FA), что у веба, но сессия отдаётся токеном
 * в теле ответа (приложение кладёт его в защищённое хранилище и шлёт как Authorization: Bearer). Только для сотрудников.
 */

const TICKET_TTL_MS = 5 * 60_000;

export const loginBody = z.object({ login: z.string().trim().min(1).max(200), password: z.string().min(1).max(200) });
export const secondFactorBody = z.object({ ticket: z.string().min(10).max(300), code: z.string().trim().min(4).max(40) });

export interface MobileSession {
  token: string;
  expiresAt: string;
  user: { id: string; name: string; email: string };
}

/** «Билет» второго шага: подписанный id сотрудника на 5 минут (как cookie веба, но в теле ответа). */
export function issueTicket(userId: string) {
  return signValue(`${userId}.${Date.now() + TICKET_TTL_MS}`);
}

export function readTicket(ticket: string): string | null {
  const data = verifySigned(ticket);
  if (!data) return null;
  const [userId, exp] = data.split(".");
  return Number(exp) > Date.now() ? userId : null;
}

/** Ошибка входа (пароль, код) — 401 с текстом для экрана; всё остальное — настоящая ошибка сервера. */
export function authFailure(err: unknown): Response {
  const text = IdentityError.is(err) ? staffActionError(err, IdentityError) : null;
  if (!text) throw err;
  return Response.json({ error: text }, { status: 401 });
}

/** Слишком много попыток входа с адреса или на логин — 429 с текстом для экрана; null — можно пробовать. */
export async function limited(key: string): Promise<Response | null> {
  const ip = await trustedClientIp();
  if ((await rateLimit(`m-login:${ip}`, 30, 900_000)) && (await rateLimit(`m-login:${key.toLowerCase()}`, 10, 900_000))) return null;
  return Response.json({ error: admin.mobileTooManyLogins }, { status: 429 });
}

/** Сессия создана: оставляем только сотрудников — клиентскому аккаунту токен приложения не выдаём (и закрываем его сессию). */
export async function finishSession(result: { token: string; expiresAt: Date; user: { id: string; name: string; email: string; isStaff: boolean } }): Promise<MobileSession> {
  const u = result.user;
  if (!u.isStaff) {
    await container().identity.auth.logout(result.token);
    throw new HttpError(403, "forbidden");
  }
  return { token: result.token, expiresAt: result.expiresAt.toISOString(), user: { id: u.id, name: u.name, email: u.email } };
}
