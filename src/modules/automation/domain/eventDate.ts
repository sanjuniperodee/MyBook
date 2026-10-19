import { shiftDay } from "./holidays";
import type { AutomationRule } from "./rules";

/**
 * «Успеть к дате» (deals-28, automation-5): открытая сделка, до даты события (своё поле «Дата события», event_date) —
 * N дней или меньше. По умолчанию — за 10 дней (печать — около недели рабочих дней, плюс доставка); пределы — до 60 дней.
 */
export const EVENT_DATE_DEFAULTS = { daysBefore: 10 } as const;
export const EVENT_DATE_LIMITS = { daysBefore: 60 } as const;

/** Объект срабатывания: сделка и дата события. Перенесли дату — правило сработает для сделки снова. */
export const eventDateSubject = (dealId: string, date: string) => `deal:${dealId}:event_date:${date}`;

/** Порог «книга заполнена меньше X%» из условия правила: 1…100, иначе не проверяется (null). */
export function bookBelowPercent(conditions: AutomationRule["conditions"] | undefined): number | null {
  const n = Number(conditions?.bookBelow);
  return Number.isInteger(n) && n >= 1 && n <= 100 ? n : null;
}

/**
 * Что выбрать для правила сегодня: даты события от today (ГГГГ-ММ-ДД по поясу магазина: после полуночи по Алматы —
 * уже новый день) до today + daysBefore включительно; порог заполненности книги (null — не проверять) и «ничего не
 * оплачено».
 */
export function eventDateQuery(rule: Pick<AutomationRule, "conditions">, today: string) {
  const raw = Number(rule.conditions?.daysBefore ?? EVENT_DATE_DEFAULTS.daysBefore);
  const daysBefore = Math.min(EVENT_DATE_LIMITS.daysBefore, Math.max(1, Math.round(raw) || EVENT_DATE_DEFAULTS.daysBefore));
  return { from: today, to: shiftDay(today, daysBefore), bookBelow: bookBelowPercent(rule.conditions), unpaid: !!Number(rule.conditions?.unpaid) };
}
