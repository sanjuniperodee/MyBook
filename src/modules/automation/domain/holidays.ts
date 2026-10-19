/**
 * Праздники для повторных продаж (bots-10, analytics-11): к ним дарят книги каждый год. Список — в настройках
 * («Интеграции» → CRM → «Праздники»), правило «Приближается праздник» берёт тех, кто покупал к нему в прошлом году.
 */
export interface Holiday {
  /** Код в объекте срабатывания (holiday:<id>:<год>:<клиент>): латиница, цифры, «-». */
  id: string;
  /** Месяц и день: ММ-ДД. 29 февраля нельзя — дата должна быть каждый год. */
  date: string;
  /** Подпись по-русски — сотрудникам и клиентам с русским языком; на казахском — клиентам с казахским. */
  ru: string;
  kk: string;
}

/**
 * По умолчанию — праздники РК, к которым дарят подарки близким:
 * - Новый год — 31 декабря, как в «Успеть к дате» на сайте (дарят в канун);
 * - 14 февраля — не выходной, но повод «14 февраля» есть на сайте и в CRM;
 * - 8 Марта — государственный праздник, самый «подарочный» после Нового года;
 * - 7 мая, День защитника Отечества — государственный праздник РК, подарки мужчинам (как 23 февраля в РФ).
 * Наурыз (21–23 марта) — семейный праздник, но не про подарки; его можно добавить в настройках.
 */
export const DEFAULT_HOLIDAYS: readonly Holiday[] = [
  { id: "newyear", date: "12-31", ru: "Новый год", kk: "Жаңа жыл" },
  { id: "valentine", date: "02-14", ru: "14 февраля", kk: "14 ақпан" },
  { id: "march8", date: "03-08", ru: "8 Марта", kk: "8 наурыз" },
  { id: "defender", date: "05-07", ru: "День защитника Отечества", kk: "Отан қорғаушы күні" },
];

export const HOLIDAYS_MAX = 20;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const ID = /^[a-z0-9-]{1,30}$/;

/** ММ-ДД, которая бывает каждый год (без 29 февраля). */
export function isHolidayDate(date: string) {
  const m = /^(\d{2})-(\d{2})$/.exec(date);
  if (!m) return false;
  const month = Number(m[1]);
  const day = Number(m[2]);
  return month >= 1 && month <= 12 && day >= 1 && day <= DAYS_IN_MONTH[month - 1];
}

/** Почему список нельзя сохранить (ключ словаря admin) или null. */
export function holidaysError(list: readonly Holiday[]): "holidaysTooMany" | "holidayDateInvalid" | "holidayNameMissing" | "holidayDuplicate" | null {
  if (list.length > HOLIDAYS_MAX) return "holidaysTooMany";
  if (list.some((h) => !isHolidayDate(h.date))) return "holidayDateInvalid";
  if (list.some((h) => !h.ru.trim() || !h.kk.trim() || !ID.test(h.id))) return "holidayNameMissing";
  if (new Set(list.map((h) => h.id)).size !== list.length || new Set(list.map((h) => h.date)).size !== list.length) return "holidayDuplicate";
  return null;
}

/** Список из настройки (JSON); пусто или испорчено — праздники по умолчанию, «[]» — праздников нет. */
export function parseHolidays(raw: string | null | undefined): Holiday[] {
  if (!raw?.trim()) return [...DEFAULT_HOLIDAYS];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [...DEFAULT_HOLIDAYS];
    const list = value
      .filter((h): h is Record<string, unknown> => !!h && typeof h === "object")
      .map((h) => ({ id: String(h.id ?? ""), date: String(h.date ?? ""), ru: String(h.ru ?? "").trim(), kk: String(h.kk ?? "").trim() }));
    return holidaysError(list) ? [...DEFAULT_HOLIDAYS] : list;
  } catch {
    return [...DEFAULT_HOLIDAYS];
  }
}

/** Код нового праздника, добавленного в настройках: h<ММДД> (даты в списке не повторяются — коды тоже). */
export const holidayIdFor = (date: string) => `h${date.replace("-", "")}`;

const dayMs = 86_400_000;
const utcDay = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/** День ГГГГ-ММ-ДД со сдвигом на days. */
export const shiftDay = (iso: string, days: number) => isoDay(utcDay(iso) + days * dayMs);

export interface UpcomingHoliday {
  holiday: Holiday;
  /** Ближайшая дата праздника (сегодня или позже), ГГГГ-ММ-ДД. */
  date: string;
  year: number;
  inDays: number;
  /** Та же дата год назад — к ней покупали в прошлом году. */
  lastYear: string;
}

/**
 * Праздники, до которых от today (ГГГГ-ММ-ДД по поясу магазина) 0…daysBefore дней, ближайшие первыми; only — один
 * праздник по коду (условие правила), пусто — любой из списка.
 */
export function upcomingHolidays(list: readonly Holiday[], today: string, daysBefore: number, only?: string | null): UpcomingHoliday[] {
  const year = Number(today.slice(0, 4));
  return list
    .filter((h) => !only || h.id === only)
    .map((holiday) => {
      const thisYear = `${year}-${holiday.date}`;
      const date = thisYear >= today ? thisYear : `${year + 1}-${holiday.date}`;
      const y = Number(date.slice(0, 4));
      return { holiday, date, year: y, inDays: Math.round((utcDay(date) - utcDay(today)) / dayMs), lastYear: `${y - 1}-${holiday.date}` };
    })
    .filter((u) => u.inDays <= daysBefore)
    .sort((a, b) => a.inDays - b.inDays);
}

/**
 * Окна покупок для праздника: прошлогодние — [дата год назад − windowDays, дата год назад] (к ней и покупали);
 * «уже купил в этом сезоне» — с даты праздника − daysBefore − windowDays (так рано к нему покупают и в этом году).
 */
export function holidayWindows(u: Pick<UpcomingHoliday, "date" | "lastYear">, windowDays: number, daysBefore: number) {
  return { from: shiftDay(u.lastYear, -windowDays), to: u.lastYear, seasonFrom: shiftDay(u.date, -(daysBefore + windowDays)) };
}
