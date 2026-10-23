/**
 * «Успею ли к празднику»: календарь праздников и вердикт по дате и способу доставки.
 * Расчёт сроков — в lib/occasions (тот же, что в оформлении заказа и в письме с напоминанием), здесь — только обёртка.
 */
import type { DeliveryId } from "@/config/site";
import { deadlineFor, startOfDay, toIsoDay } from "@/lib/occasions";
import { parseDay } from "./together";

export type HolidayId = "valentine" | "defender" | "march8" | "nauryz" | "defenderKz" | "victory" | "knowledge" | "teachers" | "newyear";

interface Holiday {
  id: HolidayId;
  fixed?: { month: number; day: number };
  floating?: (year: number) => Date;
}

/** День учителя в Казахстане — первое воскресенье октября (как в lib/occasions). */
const firstSundayOfOctober = (year: number) => {
  const d = new Date(year, 9, 1);
  d.setDate(1 + ((7 - d.getDay()) % 7));
  return d;
};

/** Праздники, к которым в Казахстане чаще всего дарят: названия — в содержимом инструмента. */
export const holidays: Holiday[] = [
  { id: "valentine", fixed: { month: 2, day: 14 } },
  { id: "defender", fixed: { month: 2, day: 23 } },
  { id: "march8", fixed: { month: 3, day: 8 } },
  { id: "nauryz", fixed: { month: 3, day: 22 } },
  { id: "defenderKz", fixed: { month: 5, day: 7 } },
  { id: "victory", fixed: { month: 5, day: 9 } },
  { id: "knowledge", fixed: { month: 9, day: 1 } },
  { id: "teachers", floating: firstSundayOfOctober },
  { id: "newyear", fixed: { month: 12, day: 31 } },
];

/** Ближайшая дата праздника (сегодня — ещё считается). */
export function nextHolidayDate(h: Holiday, now: Date): Date {
  const today = startOfDay(now);
  const at = (year: number) => (h.fixed ? new Date(year, h.fixed.month - 1, h.fixed.day) : h.floating!(year));
  const d = at(today.getFullYear());
  return d < today ? at(today.getFullYear() + 1) : d;
}

/** Праздники в порядке наступления, начиная с ближайшего. */
export function upcomingHolidays(now: Date): { id: HolidayId; date: Date; iso: string }[] {
  return holidays
    .map((h) => {
      const date = nextHolidayDate(h, now);
      return { id: h.id, date, iso: toIsoDay(date) };
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

export type Verdict = "past" | "relaxed" | "soon" | "urgent" | "express" | "digital";

export interface DeadlineView {
  verdict: Verdict;
  daysToTarget: number;
  /** Заказать до — обычное производство. */
  orderBy: Date;
  daysToOrder: number;
  /** Заказать до — экспресс-печать; null, если услуги нет в продаже. */
  orderByExpress: Date | null;
}

/**
 * Вердикт для даты вручения. Экспресс-печать (3–4 рабочих дня) — платная добавка к печатной книге: если её нет в продаже,
 * «успеет только с экспрессом» превращается в «остаётся электронная версия».
 */
export function deadlineView(target: string, now: Date, delivery: DeliveryId, expressAvailable: boolean): DeadlineView | null {
  if (!parseDay(target)) return null;
  const dl = deadlineFor(target, now, delivery);
  const verdict: Verdict = dl.state === "premium" && !expressAvailable ? "digital" : dl.state === "premium" ? "express" : dl.state;
  return { verdict, daysToTarget: dl.daysToTarget, orderBy: dl.orderBy, daysToOrder: dl.daysToOrder, orderByExpress: expressAvailable ? dl.orderByPremium : null };
}
