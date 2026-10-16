/**
 * Рабочее время отдела продаж: когда распределять заявки, когда включать автоответ «ответим утром»
 * и как считать норматив ответа (ночь не должна «сжигать» SLA). Время — по часовому поясу магазина (storeTimeZone). Покрыт тестами.
 */
import { storeTimeZone, timeZoneOffset, zonedParts } from "@/shared/domain/time";

export interface WorkHours {
  /** Дни недели: 1 — понедельник … 7 — воскресенье. */
  days: number[];
  /** «09:00» — начало, «21:00» — конец. Если конец раньше начала — смена через полночь. */
  from: string;
  to: string;
}

const defaultWorkHours: WorkHours = { days: [1, 2, 3, 4, 5, 6, 7], from: "09:00", to: "21:00" };

const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export function parseWorkHours(raw: string | null | undefined): WorkHours {
  try {
    const v = JSON.parse(raw ?? "") as Partial<WorkHours>;
    const days = Array.isArray(v.days) ? [...new Set(v.days.map(Number).filter((d) => d >= 1 && d <= 7))].sort() : defaultWorkHours.days;
    const from = typeof v.from === "string" && timeRe.test(v.from) ? v.from : defaultWorkHours.from;
    const to = typeof v.to === "string" && timeRe.test(v.to) ? v.to : defaultWorkHours.to;
    return { days, from, to };
  } catch {
    return defaultWorkHours;
  }
}

export const isValidTime = (t: string) => timeRe.test(t);

export function isWorkTime(date: Date, hours: WorkHours, tz = storeTimeZone()) {
  const p = zonedParts(date, tz);
  const from = toMin(hours.from);
  const to = toMin(hours.to);
  if (from === to) return hours.days.includes(p.weekday); // круглосуточно в рабочие дни
  if (from < to) return hours.days.includes(p.weekday) && p.minutes >= from && p.minutes < to;
  // Через полночь: вечер относится к текущему дню, ночь — к предыдущему.
  if (p.minutes >= from) return hours.days.includes(p.weekday);
  if (p.minutes < to) return hours.days.includes(p.weekday === 1 ? 7 : p.weekday - 1);
  return false;
}

/** Сколько рабочих минут прошло между a и b (для норматива ответа). */
export function workMinutesBetween(a: Date, b: Date, hours: WorkHours, tz = storeTimeZone()) {
  const start = a.getTime();
  const end = b.getTime();
  if (end <= start) return 0;
  const from = toMin(hours.from);
  let to = toMin(hours.to);
  if (to <= from) to += 24 * 60;
  let total = 0;
  // Идём по местным дням, начиная с предыдущего (его ночная смена могла захватить начало интервала).
  const first = zonedParts(a, tz);
  const firstMidnight = Date.UTC(first.y, first.m - 1, first.d) - timeZoneOffset(a, tz) * 60_000;
  for (let i = -1; i <= 62; i++) {
    const noon = new Date(firstMidnight + i * 86_400_000 + 12 * 3_600_000);
    const p = zonedParts(noon, tz);
    const midnight = Date.UTC(p.y, p.m - 1, p.d) - timeZoneOffset(noon, tz) * 60_000;
    if (midnight > end) break;
    if (!hours.days.includes(p.weekday)) continue;
    const winStart = midnight + from * 60_000;
    const winEnd = midnight + (from === toMin(hours.to) ? from + 24 * 60 : to) * 60_000;
    total += Math.max(0, Math.min(end, winEnd) - Math.max(start, winStart));
  }
  return Math.floor(total / 60_000);
}
