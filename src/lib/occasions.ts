/**
 * Поводы для подарка и расчёт «успеть к дате».
 * Модуль общий для сервера и браузера: без server-only и без обращений к базе.
 */
import { deliveryOptions, productionWorkdays, type DeliveryId, type PlanId } from "@/config/site";

export type OccasionId = "anniversary" | "birthday" | "valentine" | "march8" | "newyear" | "wedding" | "parents" | "graduation" | "other";

/** Названия поводов на обоих языках — в словаре: common.occasions[id]. */
export interface Occasion {
  id: OccasionId;
  /** Фиксированная дата праздника (месяц 1–12, день). */
  fixed?: { month: number; day: number };
}

export const occasions: Occasion[] = [
  { id: "anniversary" },
  { id: "birthday" },
  { id: "valentine", fixed: { month: 2, day: 14 } },
  { id: "march8", fixed: { month: 3, day: 8 } },
  { id: "newyear", fixed: { month: 12, day: 31 } },
  { id: "wedding" },
  { id: "parents" },
  { id: "graduation" },
  { id: "other" },
];

export function getOccasion(id: string | null | undefined): Occasion | undefined {
  return occasions.find((o) => o.id === id);
}

const DAY = 86_400_000;

/** Дата в формате YYYY-MM-DD → полночь по местному времени. */
export function parseDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function toIsoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Ближайшая дата праздника с фиксированной датой (сегодня — ещё считается). */
export function nextFixedDate(o: Occasion, now: Date): string | null {
  if (!o.fixed) return null;
  const today = startOfDay(now);
  let d = new Date(today.getFullYear(), o.fixed.month - 1, o.fixed.day);
  if (d < today) d = new Date(today.getFullYear() + 1, o.fixed.month - 1, o.fixed.day);
  return toIsoDay(d);
}

export function daysBetween(from: Date, to: Date) {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY);
}

/** Отнимает рабочие дни (пн–пт). */
export function subtractWorkdays(d: Date, n: number): Date {
  const r = startOfDay(d);
  let left = n;
  while (left > 0) {
    r.setDate(r.getDate() - 1);
    const wd = r.getDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return r;
}

/** Последний день, когда нужно оформить заказ, чтобы книга приехала к дате. */
export function orderByDate(target: string, plan: PlanId, delivery: DeliveryId): Date {
  const deliveryDays = deliveryOptions.find((d) => d.id === delivery)?.maxDays ?? 7;
  const production = plan === "premium" ? productionWorkdays.premium : productionWorkdays.standard;
  // День запаса на проверку макета и передачу в печать.
  const shipped = new Date(parseDay(target).getTime() - deliveryDays * DAY);
  return subtractWorkdays(shipped, production + 1);
}

export type DeadlineState = "relaxed" | "soon" | "urgent" | "premium" | "digital" | "past";

export interface Deadline {
  target: string;
  daysToTarget: number;
  /** Заказать до (обычная книга, курьер). */
  orderBy: Date;
  daysToOrder: number;
  /** Заказать до (Премиум — приоритетное производство, курьер). */
  orderByPremium: Date;
  state: DeadlineState;
}

/**
 * Состояние дедлайна:
 * relaxed — больше двух недель запаса; soon — до 14 дней; urgent — до 3 дней;
 * premium — обычная уже не успевает, но Премиум с приоритетом — да;
 * digital — печатная не успевает, остаётся электронная; past — дата прошла.
 */
export function deadlineFor(target: string, now: Date, delivery: DeliveryId = "courier"): Deadline {
  const today = startOfDay(now);
  const daysToTarget = daysBetween(today, parseDay(target));
  const orderBy = orderByDate(target, "hardcover", delivery);
  const orderByPremium = orderByDate(target, "premium", delivery);
  const daysToOrder = daysBetween(today, orderBy);
  let state: DeadlineState;
  if (daysToTarget < 0) state = "past";
  else if (daysToOrder >= 14) state = "relaxed";
  else if (daysToOrder > 3) state = "soon";
  else if (daysToOrder >= 0) state = "urgent";
  else if (daysBetween(today, orderByPremium) >= 0) state = "premium";
  else state = "digital";
  return { target, daysToTarget, orderBy, daysToOrder, orderByPremium, state };
}
