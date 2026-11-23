import type { AutomationRule } from "./rules";

/**
 * «Клиент молчит после нашего ответа» (automation-6): менеджер ответил клиенту (из CRM или с телефона магазина), а
 * клиент N часов ничего не пишет. По умолчанию — сутки и не больше 20 диалогов в день (как у «Забытой сделки»: задачи
 * одному-двум менеджерам, остальные — в следующие дни); пределы — 1…168 часов (неделя) и до 200 в день.
 */
export const SILENT_DEFAULTS = { hours: 24, perDay: 20 } as const;
export const SILENT_LIMITS = { hours: 168, perDay: 200 } as const;
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

/**
 * Что выбрать сейчас: наш ответ не позже before (now − N часов) и не раньше since (before − неделя); этап сделки (null —
 * любой открытый) и сколько диалогов правило берёт в день.
 */
export function silentQuery(rule: Pick<AutomationRule, "conditions">, now: Date) {
  const before = new Date(now.getTime() - silentHours(rule) * 3_600_000);
  const n = Math.round(Number(rule.conditions?.perDay ?? SILENT_DEFAULTS.perDay));
  const perDay = Math.min(SILENT_LIMITS.perDay, Math.max(1, n || SILENT_DEFAULTS.perDay));
  const stageId = rule.conditions?.stageId ? String(rule.conditions.stageId) : null;
  return { before, since: new Date(before.getTime() - SILENT_LOOKBACK_DAYS * 86_400_000), stageId, perDay };
}
