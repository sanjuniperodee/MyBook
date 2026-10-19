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

/**
 * Когда начнётся рабочее время: сейчас рабочее — сам момент date; иначе начало ближайшей смены (по поясу магазина).
 * null — в графике нет рабочих дней. Для автоответов «менеджер ответит завтра с 09:00».
 */
export function nextWorkStart(date: Date, hours: WorkHours, tz = storeTimeZone()): Date | null {
  if (!hours.days.length) return null;
  if (isWorkTime(date, hours, tz)) return date;
  const p = zonedParts(date, tz);
  const from = toMin(hours.from);
  for (let i = 0; i <= 8; i++) {
    // Полдень местного дня i — от него берём дату и смещение пояса (переход на летнее время не сдвигает день).
    const noon = new Date(Date.UTC(p.y, p.m - 1, p.d + i, 12) - timeZoneOffset(date, tz) * 60_000);
    const day = zonedParts(noon, tz);
    if (!hours.days.includes(day.weekday)) continue;
    const start = new Date(Date.UTC(day.y, day.m - 1, day.d, Math.floor(from / 60), from % 60) - timeZoneOffset(noon, tz) * 60_000);
    if (start.getTime() > date.getTime()) return start;
  }
  return null;
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

/**
 * Срок через N рабочих минут от date: ночь и выходные не считаются. Сейчас не рабочее время — отсчёт с начала ближайшей
 * смены (N = 0 — само начало смены, как nextWorkStart). Пропущенный в 23:00 звонок со сроком «15 минут» — к 09:15, а не
 * просрочен к началу смены. В графике нет рабочих дней (или срок дальше двух месяцев) — календарные минуты.
 */
export function addWorkMinutes(date: Date, minutes: number, hours: WorkHours, tz = storeTimeZone()): Date {
  const start = date.getTime();
  const total = Math.max(0, minutes) * 60_000;
  if (!hours.days.length) return new Date(start + total);
  const from = toMin(hours.from);
  let to = toMin(hours.to);
  if (to <= from) to += 24 * 60;
  const span = (from === toMin(hours.to) ? 24 * 60 : to - from) * 60_000;
  let left = total;
  // Идём по местным дням, начиная с предыдущего (его ночная смена могла захватить date), как workMinutesBetween.
  const first = zonedParts(date, tz);
  const firstMidnight = Date.UTC(first.y, first.m - 1, first.d) - timeZoneOffset(date, tz) * 60_000;
  for (let i = -1; i <= 62; i++) {
    const noon = new Date(firstMidnight + i * 86_400_000 + 12 * 3_600_000);
    const p = zonedParts(noon, tz);
    if (!hours.days.includes(p.weekday)) continue;
    const midnight = Date.UTC(p.y, p.m - 1, p.d) - timeZoneOffset(noon, tz) * 60_000;
    const winStart = Math.max(start, midnight + from * 60_000);
    const winEnd = midnight + from * 60_000 + span;
    if (winEnd <= winStart) continue;
    if (left <= winEnd - winStart) return new Date(winStart + left);
    left -= winEnd - winStart;
  }
  return new Date(start + total);
}
