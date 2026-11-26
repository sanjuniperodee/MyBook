import { signValue, verifySigned } from "./crypto";

/** Время жизни подписанного «билета» второго фактора (5 минут — одинаково для веба, мобильного API и NestJS). */
export const TWO_FACTOR_TICKET_TTL_MS = 5 * 60_000;

/** «Билет» второго шага: подписанный id сотрудника на 5 минут (HMAC-SHA256 без состояния в БД). */
export function issueTicket(userId: string, now = Date.now()): string {
  return signValue(`${userId}.${now + TWO_FACTOR_TICKET_TTL_MS}`);
}

/** Проверка подписи и срока «билета» второго фактора; при истечении или подделке — null. */
export function readTicket(ticket: string, now = Date.now()): string | null {
  const data = verifySigned(ticket);
  if (!data) return null;
  const [userId, exp] = data.split(".");
  return Number(exp) > now ? userId : null;
}
