import { zonedParts } from "@/shared/domain/time";

/**
 * Начало дня магазина (storeTimeZone) со сдвигом в днях — полночь этого дня в поясе процесса: при заданном TZ это
 * полночь магазина; iso() от результата — день магазина.
 */
export function localDay(offsetDays: number) {
  const p = zonedParts(new Date());
  return new Date(p.y, p.m - 1, p.d + offsetDays);
}

export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
