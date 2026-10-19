import { contextError } from "./DomainError";

/**
 * Лимит скидки от прайса (deals-11) — одно правило для всех точек продажи: счёт из чата, бюджет и тариф договорённости,
 * новая сделка «вручную», формы «Новый клиент» и «Сделки по договорённости». Лимит — настройка CRM crm.maxDiscount (%),
 * без лимита продают роли с правом prices.discount_unlimited. Правило общее для продаж, клиентов и заказов, поэтому живёт
 * в общем ядре; файл без зависимостей — им пользуются и сервер (проверка), и формы (подсказка «ниже прайса на N%»).
 */

/**
 * Цена ниже прайса сверх лимита. params — [лимит %, прайс ₸, без тарифа (сравнивали с самым дорогим тарифом)];
 * текст для сотрудника — словарь admin по коду.
 */
export const DiscountError = contextError<"discountOverLimit">("discount", "DiscountError");
export type DiscountError = InstanceType<typeof DiscountError>;

export interface DiscountCheck {
  /** Прайс, с которым сравниваем: тариф договорённости (без тарифа — самый дорогой из продающихся). */
  listPrice: number;
  /** Цена продажи одной книги. */
  price: number;
  /** Лимит скидки сотрудника, %; null — без лимита. */
  maxPercent: number | null;
  /** Тарифа нет: цена действует на любой тариф, поэтому прайс — самый дорогой. */
  planless?: boolean;
}

export const DiscountPolicy = {
  /** Самая низкая цена в пределах лимита: прайс минус maxPercent %, с округлением до тенге. */
  floor(listPrice: number, maxPercent: number): number {
    return Math.round(listPrice * (1 - maxPercent / 100));
  },

  /** На сколько процентов цена ниже прайса, с точностью до десятой; 0 — не ниже (или прайса нет). */
  percent(listPrice: number, price: number): number {
    if (!(listPrice > 0) || price >= listPrice) return 0;
    return Math.round(((listPrice - price) / listPrice) * 1000) / 10;
  },

  /** Цена в пределах лимита (без лимита — любая). */
  allows(c: DiscountCheck): boolean {
    return c.maxPercent === null || !(c.listPrice > 0) || c.price >= DiscountPolicy.floor(c.listPrice, c.maxPercent);
  },

  /** Проверка перед продажей: сверх лимита — DiscountError. Возвращает скидку в % (0 — не ниже прайса) для журнала deal.discount. */
  check(c: DiscountCheck): number {
    if (!DiscountPolicy.allows(c)) throw new DiscountError("discountOverLimit", undefined, [c.maxPercent, c.listPrice, !!c.planless]);
    return DiscountPolicy.percent(c.listPrice, c.price);
  },

  /** Лимит из настройки crm.maxDiscount: целое 0…100; пусто или мусор — 0 (ниже прайса нельзя). */
  readLimit(raw: string | null | undefined): number {
    const n = Math.floor(Number(raw));
    return Number.isFinite(n) && n > 0 ? Math.min(100, n) : 0;
  },
};

/** Скидка для подписи: «16,7%». */
export const percentLabel = (percent: number) => `${percent.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`;
