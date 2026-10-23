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
  /**
   * Выходные по датам магазина «2026-12-16» (tasks-23): праздники, в которые отдел не работает, хотя день недели рабочий.
   * Смена через полночь принадлежит дню начала: выходной 16.12 снимает и ночь на 17.12. Нет поля — праздников нет.
   */
  off?: string[];
}

/** Сколько дат-исключений хранит график: праздники РК — около 15 в год, с запасом на два года. */
export const WORK_OFF_MAX = 60;

/** Местная дата «ГГГГ-ММ-ДД»; день за пределами месяца переносится (32.12 → 01.01 следующего года). */
const ymd = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
};

const dateRe = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const isValidOffDate = (d: string) => dateRe.test(d);

/**
 * Праздники Казахстана с фиксированной датой (Трудовой кодекс РК, ст. 84–85) на год — заготовка для графика. Курбан айт
 * и переносы выходных правительство объявляет каждый год отдельно: их добавляют руками.
 */
export function kzHolidays(year: number): string[] {
  // Новый год (2), Рождество, 8 Марта, Наурыз (3), 1, 7 и 9 Мая, День столицы, Конституции, Республики, Независимости.
  const days = ["01-01", "01-02", "01-07", "03-08", "03-21", "03-22", "03-23", "05-01", "05-07", "05-09", "07-06", "08-30", "10-25", "12-16"];
  return days.map((md) => `${year}-${md}`);
}

/** Даты-исключения из ввода: «2026-12-16», «16.12.2026», по одной в строке или через запятую; без повторов, по порядку. */
export function parseOffDates(raw: string): { dates: string[]; bad: string[] } {
  const dates = new Set<string>();
  const bad: string[] = [];
  for (const part of raw.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean)) {
    const ru = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(part);
    const iso = ru ? `${ru[3]}-${ru[2].padStart(2, "0")}-${ru[1].padStart(2, "0")}` : part;
    // 31.02 и подобные Date.UTC переносит на март — такая дата не та, что ввели.
    if (isValidOffDate(iso) && ymd(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), Number(iso.slice(8, 10))) === iso) dates.add(iso);
    else bad.push(part);
  }
  return { dates: [...dates].sort(), bad };
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
    const off = Array.isArray(v.off) ? [...new Set(v.off.filter((x): x is string => typeof x === "string" && isValidOffDate(x)))].sort().slice(-WORK_OFF_MAX) : [];
    return off.length ? { days, from, to, off } : { days, from, to };
  } catch {
    return defaultWorkHours;
  }
}

export const isValidTime = (t: string) => timeRe.test(t);

/** Рабочий ли местный день: день недели в графике и дата не в выходных. shift — сдвиг в днях (−1 — вчера). */
function workDay(hours: WorkHours, p: { y: number; m: number; d: number; weekday: number }, shift = 0) {
  const weekday = ((((p.weekday - 1 + shift) % 7) + 7) % 7) + 1;
  if (!hours.days.includes(weekday)) return false;
  return !hours.off?.length || !hours.off.includes(ymd(p.y, p.m, p.d + shift));
}

export function isWorkTime(date: Date, hours: WorkHours, tz = storeTimeZone()) {
  const p = zonedParts(date, tz);
  const from = toMin(hours.from);
  const to = toMin(hours.to);
  if (from === to) return workDay(hours, p); // круглосуточно в рабочие дни
  if (from < to) return workDay(hours, p) && p.minutes >= from && p.minutes < to;
  // Через полночь: вечер относится к текущему дню, ночь — к предыдущему.
  if (p.minutes >= from) return workDay(hours, p);
  if (p.minutes < to) return workDay(hours, p, -1);
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
  // Неделя графика плюс самые длинные праздники подряд (Новый год, Наурыз с выходными) — с запасом.
  for (let i = 0; i <= 8 + (hours.off?.length ?? 0); i++) {
    // Полдень местного дня i — от него берём дату и смещение пояса (переход на летнее время не сдвигает день).
    const noon = new Date(Date.UTC(p.y, p.m - 1, p.d + i, 12) - timeZoneOffset(date, tz) * 60_000);
    const day = zonedParts(noon, tz);
    if (!workDay(hours, day)) continue;
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
    if (!workDay(hours, p)) continue;
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
    if (!workDay(hours, p)) continue;
    const midnight = Date.UTC(p.y, p.m - 1, p.d) - timeZoneOffset(noon, tz) * 60_000;
    const winStart = Math.max(start, midnight + from * 60_000);
    const winEnd = midnight + from * 60_000 + span;
    if (winEnd <= winStart) continue;
    if (left <= winEnd - winStart) return new Date(winStart + left);
    left -= winEnd - winStart;
  }
  return new Date(start + total);
}

/** Местное время магазина «ГГГГ-ММ-ДДTЧЧ:ММ» — как в поле datetime-local и в сроке задачи. */
export function localStamp(date: Date, tz = storeTimeZone()) {
  const p = zonedParts(date, tz);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(Math.floor(p.minutes / 60))}:${pad(p.minutes % 60)}`;
}

export type DuePresetKey = "hour" | "morning" | "days3" | "week";

/**
 * Пресеты срока задачи (tasks-3): «через час» — в рабочем времени (вечером — к началу следующей смены), «завтра утром» —
 * начало ближайшей смены после полуночи (выходные и праздники пропускаются), «через 3 дня» и «через неделю» — начало
 * смены в тот день или ближайший рабочий после. Время — местное время магазина «ГГГГ-ММ-ДДTЧЧ:ММ».
 */
export function duePresets(now: Date, hours: WorkHours, tz = storeTimeZone()): Record<DuePresetKey, string> {
  const p = zonedParts(now, tz);
  const midnight = (days: number) => new Date(Date.UTC(p.y, p.m - 1, p.d + days) - timeZoneOffset(now, tz) * 60_000);
  const startFrom = (at: Date) => nextWorkStart(at, hours, tz) ?? at;
  return {
    hour: localStamp(addWorkMinutes(now, 60, hours, tz), tz),
    morning: localStamp(startFrom(midnight(1)), tz),
    days3: localStamp(startFrom(midnight(3)), tz),
    week: localStamp(startFrom(midnight(7)), tz),
  };
}
