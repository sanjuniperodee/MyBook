/**
 * Лимит ИИ-дизайнера: бесплатных просьб на клиента за всё время (страницы и обложка вместе), дальше — купленные
 * пакеты. Считаются только просьбы, на которые модель ответила: сбой не съедает попытку. Число меняется в админке
 * («ИИ-дизайнер», настройка designAi.freeLimit); 5 — значение по умолчанию.
 */
export const DESIGN_AI_FREE_LIMIT = 5;
/** Выше этого число в настройке не принимается (защита от опечатки «500»). */
export const DESIGN_AI_FREE_LIMIT_MAX = 100;

/** Бесплатный лимит из настройки: целое от 0 до DESIGN_AI_FREE_LIMIT_MAX, иначе — по умолчанию. */
export function parseFreeLimit(raw: string | null | undefined): number {
  const text = String(raw ?? "").trim();
  const n = /^\d{1,3}$/.test(text) ? Number(text) : -1;
  return n >= 0 && n <= DESIGN_AI_FREE_LIMIT_MAX ? n : DESIGN_AI_FREE_LIMIT;
}

export interface DesignAiQuota {
  limit: number;
  used: number;
  remaining: number;
}

export function quotaOf(used: number, limit = DESIGN_AI_FREE_LIMIT): DesignAiQuota {
  return { limit, used: Math.min(used, limit), remaining: Math.max(0, limit - used) };
}
