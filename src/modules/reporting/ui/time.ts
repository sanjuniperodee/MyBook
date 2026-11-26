import { fromZonedTime, zonedDay, zonedParts } from "@/shared/domain/time";

/**
 * Начало дня магазина (storeTimeZone) со сдвигом в днях — момент полуночи по времени магазина, в каком бы поясе ни
 * работал процесс (на Vercel он в UTC). iso() от результата — день магазина «ГГГГ-ММ-ДД».
 */
export function localDay(offsetDays: number) {
  const p = zonedParts(new Date());
  const day = new Date(Date.UTC(p.y, p.m - 1, p.d + offsetDays)).toISOString().slice(0, 10);
  return fromZonedTime(`${day}T00:00`);
}

/** День магазина «ГГГГ-ММ-ДД» для момента. */
export const iso = (d: Date) => zonedDay(d);

/** Полночь дня магазина «ГГГГ-ММ-ДД» (желаемая дата заказа, срок) — момент, сравнимый с localDay(). */
export const dayStart = (day: string) => fromZonedTime(`${day}T00:00`);
