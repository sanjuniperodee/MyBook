/**
 * Лимит ИИ-дизайнера: 5 просьб в сутки на клиента (страницы и обложка вместе). Сутки — по времени Алматы (UTC+5):
 * новые просьбы — с полуночи. Считаются только просьбы, на которые модель ответила: сбой не съедает попытку.
 */
export const DESIGN_AI_DAILY_LIMIT = 5;

const ALMATY_OFFSET_MS = 5 * 3600_000;
const DAY_MS = 86_400_000;

/** Начало текущих суток по Алматы и начало следующих (когда лимит обновится). */
export function designAiDay(now: Date): { start: Date; reset: Date } {
  const local = now.getTime() + ALMATY_OFFSET_MS;
  const start = Math.floor(local / DAY_MS) * DAY_MS - ALMATY_OFFSET_MS;
  return { start: new Date(start), reset: new Date(start + DAY_MS) };
}

export interface DesignAiQuota {
  limit: number;
  used: number;
  remaining: number;
  /** Когда снова можно (ISO). */
  resetAt: string;
}

export function quotaOf(used: number, now: Date, limit = DESIGN_AI_DAILY_LIMIT): DesignAiQuota {
  return { limit, used: Math.min(used, limit), remaining: Math.max(0, limit - used), resetAt: designAiDay(now).reset.toISOString() };
}
