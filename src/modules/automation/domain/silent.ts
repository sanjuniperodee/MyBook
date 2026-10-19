import type { AutomationRule } from "./rules";

/**
 * «Клиент молчит после нашего ответа» (automation-6): менеджер ответил клиенту (из CRM или с телефона магазина), а
 * клиент N часов ничего не пишет. По умолчанию — сутки; пределы — 1…168 часов (неделя).
 */
export const SILENT_DEFAULTS = { hours: 24 } as const;
export const SILENT_LIMITS = { hours: 168 } as const;
/**
 * Насколько старый ответ правило ещё берёт: неделя после порога. Без этого первое включение подняло бы все диалоги,
 * где когда-то последним писал менеджер; неделя покрывает ночи, выходные и простой сервера.
 */
export const SILENT_LOOKBACK_DAYS = 7;

/** Объект срабатывания: диалог и момент нашего ответа. Менеджер написал снова, клиент снова молчит — сработает снова. */
export const silentSubject = (conversationId: string, lastOutgoingAt: Date) => `conv:${conversationId}:silent:${lastOutgoingAt.toISOString()}`;

/** Сколько часов молчания из условия правила: целое 1…168, пусто или не число — сутки. */
export function silentHours(rule: Pick<AutomationRule, "conditions">) {
  const n = Math.round(Number(rule.conditions?.silentHours ?? SILENT_DEFAULTS.hours));
  return Math.min(SILENT_LIMITS.hours, Math.max(1, n || SILENT_DEFAULTS.hours));
}

/** Что выбрать сейчас: наш ответ не позже before (now − N часов) и не раньше since (before − неделя). */
export function silentQuery(rule: Pick<AutomationRule, "conditions">, now: Date) {
  const before = new Date(now.getTime() - silentHours(rule) * 3_600_000);
  return { before, since: new Date(before.getTime() - SILENT_LOOKBACK_DAYS * 86_400_000) };
}
