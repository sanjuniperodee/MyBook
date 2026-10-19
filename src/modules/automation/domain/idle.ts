import type { AutomationRule } from "./rules";

/**
 * «Сделка без активности» (automation-4, deals-21): открытая сделка без открытой задачи, по которой N дней ничего не
 * происходило. По умолчанию — 3 дня и не больше 20 сделок в день (задачи одному-двум менеджерам; остальные — в
 * следующие дни, недавно затихшие — первыми). Пределы — до 90 дней и до 200 сделок в день.
 */
export const IDLE_DEFAULTS = { days: 3, perDay: 20 } as const;
export const IDLE_LIMITS = { days: 90, perDay: 200 } as const;

/** Объект срабатывания: сделка и момент её последней активности. Что-то произошло и снова затихло — сработает снова. */
export const idleSubject = (dealId: string, lastActivity: Date) => `deal:${dealId}:idle:${lastActivity.toISOString()}`;

/** Целое из условия правила в пределах 1…max; пусто или не число — по умолчанию. */
const whole = (raw: unknown, fallback: number, max: number) => Math.min(max, Math.max(1, Math.round(Number(raw ?? fallback)) || fallback));

/**
 * Что выбрать для правила сейчас: последняя активность раньше before (now − N дней), этап (null — любой открытый) и
 * сколько сделок правило берёт в день.
 */
export function idleQuery(rule: Pick<AutomationRule, "conditions">, now: Date) {
  const days = whole(rule.conditions?.days, IDLE_DEFAULTS.days, IDLE_LIMITS.days);
  const stageId = rule.conditions?.stageId ? String(rule.conditions.stageId) : null;
  return { before: new Date(now.getTime() - days * 86_400_000), stageId, perDay: whole(rule.conditions?.perDay, IDLE_DEFAULTS.perDay, IDLE_LIMITS.perDay) };
}
