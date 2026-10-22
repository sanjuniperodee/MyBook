/**
 * Лимит ИИ-дизайнера: 5 бесплатных просьб на клиента за всё время (страницы и обложка вместе), дальше — купленные
 * пакеты. Считаются только просьбы, на которые модель ответила: сбой не съедает попытку.
 */
export const DESIGN_AI_FREE_LIMIT = 5;

export interface DesignAiQuota {
  limit: number;
  used: number;
  remaining: number;
}

export function quotaOf(used: number, limit = DESIGN_AI_FREE_LIMIT): DesignAiQuota {
  return { limit, used: Math.min(used, limit), remaining: Math.max(0, limit - used) };
}
