/**
 * Счётчик «сколько мы вместе»: дни, годы-месяцы-дни, ближайшие круглые даты и название годовщины свадьбы.
 * Чистые функции без обращений к базе и к часам — ими пользуются страница, компонент и тесты.
 */
import type { Locale } from "@/i18n/config";
import { toPublic } from "@/i18n/config";

const DAY = 86_400_000;

/** День в UTC: разница в днях не зависит от перехода на летнее время и пояса браузера. */
const utc = (y: number, m: number, d: number) => Date.UTC(y, m, d);
const dayOf = (d: Date) => utc(d.getFullYear(), d.getMonth(), d.getDate());

/** YYYY-MM-DD → дата по местному времени; мусор и невозможные даты (31 февраля) → null. */
export function parseDay(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d ? date : null;
}

export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Целых дней от start до now (отрицательное — дата в будущем). */
export function daysBetween(start: Date, now: Date): number {
  return Math.round((dayOf(now) - dayOf(start)) / DAY);
}

export interface TogetherStats {
  days: number;
  years: number;
  months: number;
  /** Дней сверх полных лет и месяцев. */
  restDays: number;
  weeks: number;
  hours: number;
}

/** Сколько прошло от start до now в днях и в «годах, месяцах, днях» (как считает человек: от числа к числу). */
export function togetherStats(start: Date, now: Date): TogetherStats {
  const days = daysBetween(start, now);
  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  let rest = now.getDate() - start.getDate();
  if (rest < 0) {
    months--;
    // Дней в месяце, предшествующем текущему.
    rest += new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  }
  if (months < 0) {
    years--;
    months += 12;
  }
  return { days, years, months, restDays: rest, weeks: Math.floor(days / 7), hours: days * 24 };
}

/** Круглые числа дней, которые пары отмечают. */
export const MILESTONE_DAYS = [100, 200, 300, 500, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 7000, 7500, 8000, 9000, 10000, 12000, 15000, 20000];

export interface Milestone {
  /** Подпись: «1000 дней» берётся из kind/value, текст — на стороне интерфейса. */
  kind: "days" | "years";
  value: number;
  date: Date;
  /** Через сколько дней (отрицательное — уже было). */
  inDays: number;
}

/** Годовщина с N годами: тот же день и месяц, 29 февраля в невисокосный год → 28 февраля. */
export function anniversaryDate(start: Date, years: number): Date {
  const d = new Date(start.getFullYear() + years, start.getMonth(), start.getDate());
  return d.getMonth() !== start.getMonth() ? new Date(start.getFullYear() + years, start.getMonth() + 1, 0) : d;
}

/**
 * Круглые даты: сколько недавно прошло и что впереди. Годовщины — каждый год, дни — по списку MILESTONE_DAYS.
 * Сначала последние `past`, затем ближайшие `next`, по порядку дат.
 */
export function milestones(start: Date, now: Date, past = 2, next = 5): Milestone[] {
  const all: Milestone[] = [];
  for (const n of MILESTONE_DAYS) {
    const date = addDays(start, n);
    all.push({ kind: "days", value: n, date, inDays: daysBetween(now, date) });
  }
  for (let y = 1; y <= 60; y++) {
    const date = anniversaryDate(start, y);
    all.push({ kind: "years", value: y, date, inDays: daysBetween(now, date) });
  }
  all.sort((a, b) => a.date.getTime() - b.date.getTime() || (a.kind === "years" ? -1 : 1));
  const before = all.filter((m) => m.inDays < 0).slice(-past);
  const after = all.filter((m) => m.inDays >= 0).slice(0, next);
  return [...before, ...after];
}

/** Названия годовщин свадьбы. Для лет без названия (16, 17, 21…) считается «ближайшая прошедшая». */
export const weddingAnniversaries: { year: number; ru: string; kk: string; uz: string }[] = [
  { year: 1, ru: "Ситцевая", kk: "Бөз", uz: "Chit" },
  { year: 2, ru: "Бумажная", kk: "Қағаз", uz: "Qog‘oz" },
  { year: 3, ru: "Кожаная", kk: "Былғары", uz: "Teri" },
  { year: 4, ru: "Льняная", kk: "Зығыр", uz: "Zig‘ir" },
  { year: 5, ru: "Деревянная", kk: "Ағаш", uz: "Yog‘och" },
  { year: 6, ru: "Чугунная", kk: "Шойын", uz: "Cho‘yan" },
  { year: 7, ru: "Медная", kk: "Мыс", uz: "Mis" },
  { year: 8, ru: "Жестяная", kk: "Қаңылтыр", uz: "Tunuka" },
  { year: 9, ru: "Фаянсовая", kk: "Фаянс", uz: "Fayans" },
  { year: 10, ru: "Оловянная (розовая)", kk: "Қалайы", uz: "Qalay (pushti)" },
  { year: 11, ru: "Стальная", kk: "Болат", uz: "Po‘lat" },
  { year: 12, ru: "Никелевая", kk: "Никель", uz: "Nikel" },
  { year: 13, ru: "Кружевная", kk: "Шілтер", uz: "Dantelali" },
  { year: 14, ru: "Агатовая", kk: "Ақық", uz: "Oqiq" },
  { year: 15, ru: "Хрустальная", kk: "Биллур", uz: "Billur" },
  { year: 20, ru: "Фарфоровая", kk: "Фарфор", uz: "Chinni" },
  { year: 25, ru: "Серебряная", kk: "Күміс", uz: "Kumush" },
  { year: 30, ru: "Жемчужная", kk: "Інжу", uz: "Injuli" },
  { year: 35, ru: "Коралловая", kk: "Маржан", uz: "Marjon" },
  { year: 40, ru: "Рубиновая", kk: "Лағыл", uz: "Yoqut" },
  { year: 45, ru: "Сапфировая", kk: "Сапфир", uz: "Safir" },
  { year: 50, ru: "Золотая", kk: "Алтын", uz: "Oltin" },
  { year: 55, ru: "Изумрудная", kk: "Изумруд", uz: "Zumrad" },
  { year: 60, ru: "Бриллиантовая", kk: "Гауһар", uz: "Brilliant" },
];

export function weddingName(year: number, locale: Locale): string | null {
  return weddingAnniversaries.find((a) => a.year === year)?.[toPublic(locale)] ?? null;
}

/** Ближайшая годовщина с названием, не раньше `fromYear` (для строки «следующая именная — …»). */
export function nextNamedAnniversary(fromYear: number): { year: number; ru: string; kk: string; uz: string } | null {
  return weddingAnniversaries.find((a) => a.year >= fromYear) ?? null;
}
