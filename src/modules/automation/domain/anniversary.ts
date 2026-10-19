import type { AutomationRule } from "./rules";

/**
 * «Годовщина повода» (contacts-16, automation-d6): за daysBefore дней до годовщины покупки — повторная продажа.
 * «Уже купил снова» — только к этой годовщине: покупка не раньше чем за windowDays дней до начала окна (к поводу
 * покупают за 2–4 недели, как к празднику) или покупка к той же дате. Покупка к другому поводу между годовщинами
 * (8 Марта между двумя днями рождения) годовщину не гасит. По умолчанию — 30 и 30 дней; пределы — 120 и 90.
 */
export const ANNIVERSARY_DEFAULTS = { daysBefore: 30, windowDays: 30 } as const;
export const ANNIVERSARY_LIMITS = { daysBefore: 120, windowDays: 90 } as const;

/** Целое из условия правила в пределах 1…max; пусто или не число — по умолчанию. */
const whole = (raw: unknown, fallback: number, max: number) => Math.min(max, Math.max(1, Math.round(Number(raw ?? fallback)) || fallback));

/**
 * Что выбрать для правила: годовщины через 0…daysBefore дней; клиент, который купил не раньше чем за repurchaseDays дней
 * до годовщины (daysBefore + windowDays — как «уже купил в этом сезоне» у праздника), уже купил к ней снова.
 */
export function anniversaryQuery(rule: Pick<AutomationRule, "conditions">) {
  const daysBefore = whole(rule.conditions?.daysBefore, ANNIVERSARY_DEFAULTS.daysBefore, ANNIVERSARY_LIMITS.daysBefore);
  const windowDays = whole(rule.conditions?.windowDays, ANNIVERSARY_DEFAULTS.windowDays, ANNIVERSARY_LIMITS.windowDays);
  return { daysBefore, repurchaseDays: daysBefore + windowDays };
}
