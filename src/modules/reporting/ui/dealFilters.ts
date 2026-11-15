import { fromZonedTime } from "@/shared/domain/time";

/**
 * Расширенные фильтры сделок (панель «Фильтр», как в amoCRM): дата создания, закрытия или смены этапа, этап, бюджет,
 * оплата, причина отказа, тег. Разбор параметров адреса — общий для запроса, страницы и сохранённых видов; мусор отбрасывается.
 */
export const DEAL_FILTER_KEYS = ["df", "from", "to", "st", "min", "max", "paid", "lr", "tag"] as const;
export const DEAL_DATE_FIELDS = { created: "создания", closed: "закрытия", stage: "смены этапа" } as const;
export type DealDateField = keyof typeof DEAL_DATE_FIELDS;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const utc = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const addDays = (day: string, n: number) => new Date(utc(day) + n * 86_400_000).toISOString().slice(0, 10);
const validDay = (v: string | undefined): v is string => !!v && DAY.test(v) && addDays(v, 0) === v;
const money = (v: string | undefined) => {
  const n = Math.round(Number((v ?? "").replace(/\s/g, "")));
  return v && Number.isFinite(n) && n >= 0 && n <= 100_000_000 ? n : null;
};

export interface DealAdvancedFilters {
  field: DealDateField;
  /** Дни периода по времени магазина (включительно) и его границы [from, to). */
  fromDay: string | null;
  toDay: string | null;
  from: Date | null;
  to: Date | null;
  stageId: string | null;
  min: number | null;
  max: number | null;
  paid: "yes" | "no" | null;
  lostReason: string | null;
  tag: string | null;
  /** Сколько расширенных фильтров включено — число на кнопке «Фильтр». */
  count: number;
}

export function dealAdvancedFilters(sp: Record<string, string | undefined>, tz: string): DealAdvancedFilters {
  const field: DealDateField = sp.df === "closed" || sp.df === "stage" ? sp.df : "created";
  let fromDay = validDay(sp.from) ? sp.from : null;
  let toDay = validDay(sp.to) ? sp.to : null;
  // Даты перепутаны местами — меняем: человек хотел период, а не пустой список.
  if (fromDay && toDay && fromDay > toDay) [fromDay, toDay] = [toDay, fromDay];
  const min = money(sp.min);
  const max = money(sp.max);
  const f = {
    field,
    fromDay,
    toDay,
    from: fromDay ? fromZonedTime(`${fromDay}T00:00:00`, tz) : null,
    to: toDay ? fromZonedTime(`${addDays(toDay, 1)}T00:00:00`, tz) : null,
    stageId: sp.st && UUID.test(sp.st) ? sp.st : null,
    min: min !== null && max !== null && min > max ? max : min,
    max: min !== null && max !== null && min > max ? min : max,
    paid: sp.paid === "yes" || sp.paid === "no" ? sp.paid : null,
    lostReason: sp.lr?.trim().slice(0, 80) || null,
    tag: sp.tag?.trim().slice(0, 40) || null,
  } as const;
  const count = [f.fromDay || f.toDay, f.stageId, f.min !== null || f.max !== null, f.paid, f.lostReason, f.tag].filter(Boolean).length;
  return { ...f, count };
}

/** Готовые периоды панели: сегодня, вчера, 7 и 30 дней, этот и прошлый месяц (today — день магазина ГГГГ-ММ-ДД). */
export function dealDatePresets(today: string): { key: string; label: string; from: string; to: string }[] {
  const monthStart = `${today.slice(0, 8)}01`;
  const prevEnd = addDays(monthStart, -1);
  return [
    { key: "today", label: "Сегодня", from: today, to: today },
    { key: "yesterday", label: "Вчера", from: addDays(today, -1), to: addDays(today, -1) },
    { key: "7d", label: "7 дней", from: addDays(today, -6), to: today },
    { key: "30d", label: "30 дней", from: addDays(today, -29), to: today },
    { key: "month", label: "Этот месяц", from: monthStart, to: today },
    { key: "prev", label: "Прошлый месяц", from: `${prevEnd.slice(0, 8)}01`, to: prevEnd },
  ];
}
