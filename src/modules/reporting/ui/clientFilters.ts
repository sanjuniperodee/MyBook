import type { OccasionId } from "@/lib/occasions";

/**
 * Фильтры списка клиентов для ручной добивки к праздникам (contacts-13): кто покупал в каком месяце, к какому поводу и в
 * каком месяце повод, без открытой сделки — например, «покупали к 14 февраля в прошлом году и сейчас с ними не работают».
 */
export interface ClientFilters {
  /** Повод книги или сделки. */
  occasion?: OccasionId;
  /** Месяц повода 1–12: дата в книге или «Дата события» сделки; у праздников с постоянной датой — их месяц. */
  month?: number;
  /** Покупка (оплата) в месяцы с … по … включительно: «2026-01» — «2026-03». */
  boughtFrom?: string;
  boughtTo?: string;
  /** У клиента нет открытой сделки — с ним сейчас никто не работает. */
  noOpenDeal?: boolean;
}

export const CLIENT_OCCASIONS: readonly OccasionId[] = ["birthday", "anniversary", "valentine", "march8", "newyear", "wedding", "parents", "graduation", "teachersday", "other"];

const monthRe = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Фильтры из адресной строки (страница и выгрузка CSV): мусор отбрасывается. */
export function clientFiltersFrom(get: (key: string) => string | null | undefined): ClientFilters {
  const occasion = get("occ");
  const month = Number(get("month"));
  const from = get("from");
  const to = get("to");
  return {
    ...(occasion && (CLIENT_OCCASIONS as readonly string[]).includes(occasion) ? { occasion: occasion as OccasionId } : {}),
    ...(Number.isInteger(month) && month >= 1 && month <= 12 ? { month } : {}),
    ...(from && monthRe.test(from) ? { boughtFrom: from } : {}),
    ...(to && monthRe.test(to) ? { boughtTo: to } : {}),
    ...(get("noDeal") === "1" ? { noOpenDeal: true } : {}),
  };
}

/** Обратно в адресную строку. */
export function clientFiltersQuery(f: ClientFilters): Record<string, string | undefined> {
  return { occ: f.occasion, month: f.month ? String(f.month) : undefined, from: f.boughtFrom, to: f.boughtTo, noDeal: f.noOpenDeal ? "1" : undefined };
}

/** Первое число месяца после «2026-03» — правая граница периода покупок. */
export function monthAfter(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}
