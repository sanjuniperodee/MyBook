/**
 * Часовой пояс магазина — одно правило на всё приложение: TZ процесса, иначе Алматы.
 * По нему считаются границы дней и месяцев (отчёты, планы, переходы по ссылкам), рабочее время отдела продаж,
 * часы автописем, время в CRM и SQL-выборки (пояс передаётся параметром). В браузере TZ не задан, поэтому
 * клиентский компонент, которому нужен пояс магазина, получает его от сервера.
 */
const DEFAULT_STORE_TIME_ZONE = "Asia/Almaty";

export const storeTimeZone = (): string => process.env.TZ || DEFAULT_STORE_TIME_ZONE;

/** Местные дата и время момента: день недели 1 — понедельник … 7 — воскресенье, minutes — минуты от полуночи. */
interface ZonedParts {
  y: number;
  m: number;
  d: number;
  weekday: number;
  minutes: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function zonedParts(date: Date, tz = storeTimeZone()): ZonedParts {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", weekday: "short", hourCycle: "h23" });
    formatters.set(tz, f);
  }
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), weekday: WEEKDAYS.indexOf(p.weekday) + 1, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

/** Местный день YYYY-MM-DD (по умолчанию — по часовому поясу магазина). Без zonedParts: нужен и в браузере. */
export const zonedDay = (date: Date, tz = storeTimeZone()) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(date);

/** Местный месяц YYYY-MM. */
export const zonedMonth = (date: Date, tz = storeTimeZone()) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit" }).format(date);

/** Смещение пояса от UTC в минутах для момента date (учитывает переход на летнее время, если он есть). */
export function timeZoneOffset(date: Date, tz = storeTimeZone()) {
  const p = zonedParts(date, tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, Math.floor(p.minutes / 60), p.minutes % 60);
  return Math.round((asUtc - Math.floor(date.getTime() / 60_000) * 60_000) / 60_000);
}

const withZone = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/**
 * Момент для местного времени без зоны («2026-10-13T12:05:00») в поясе tz. Строка со своей зоной (Z, +05:00)
 * берётся как есть; разбор — как у new Date (не дата — Invalid Date).
 */
export function fromZonedTime(local: string, tz = storeTimeZone()): Date {
  if (withZone.test(local)) return new Date(local);
  const wall = new Date(`${local}+00:00`);
  if (Number.isNaN(wall.getTime())) return wall;
  // Смещение берём у ближайшего момента и уточняем: на переходе летнего времени оно меняется.
  const guess = wall.getTime() - timeZoneOffset(wall, tz) * 60_000;
  return new Date(wall.getTime() - timeZoneOffset(new Date(guess), tz) * 60_000);
}
