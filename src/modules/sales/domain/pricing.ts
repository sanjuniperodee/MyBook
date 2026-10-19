import { getPlan, getVisiblePlans } from "@/config/site";
import type { DealSource } from "@/shared/domain/dealSources";
import { DiscountPolicy } from "@/shared/domain/discount";

/** Источник сделки; формы присылают строку — важно лишь, «вручную» ли сделка. */
type Source = DealSource | (string & {});

/** Цена сделки против прайса: для лимита скидки, журнала deal.discount и подсказки у бюджета. */
export interface DealPrice {
  /** Тариф договорённости; null — не указан. */
  plan: string | null;
  /** Прайс: тариф договорённости, без тарифа — самый дорогой из продающихся. */
  listPrice: number;
  planless: boolean;
  /** Цена одной книги (сумма сделки). */
  price: number;
  /** На сколько процентов ниже прайса (0 — не ниже). */
  percent: number;
}

/**
 * С каким прайсом сравнивается сумма сделки. Тариф договорённости указан — с его ценой из «Цен и тарифов». Сделка «вручную»
 * без тарифа — с самым дорогим из продающихся: договорённость без тарифа — потолок цены любого тарифа, который выберет клиент
 * (chat-invoices 1.2). null — сумма не цена продажи: бюджет заявки без тарифа — только оценка.
 */
export function dealListPrice(plan: string | null, source: Source): { listPrice: number; planless: boolean } | null {
  const p = plan ? getPlan(plan) : undefined;
  if (p) return { listPrice: p.price, planless: false };
  if (source !== "manual") return null;
  const top = Math.max(0, ...getVisiblePlans().map((x) => x.price));
  return top > 0 ? { listPrice: top, planless: true } : null;
}

/** Цена сделки против прайса без проверки лимита; null — сумма не цена продажи или пуста. */
export function dealPrice(plan: string | null, source: Source, price: number): DealPrice | null {
  const list = price > 0 ? dealListPrice(plan, source) : null;
  return list ? { plan, ...list, price, percent: DiscountPolicy.percent(list.listPrice, price) } : null;
}

/** То же с лимитом скидки сотрудника (null — без лимита): цена ниже прайса сверх лимита — DiscountError. */
export function checkDealPrice(plan: string | null, source: Source, price: number, maxPercent: number | null): DealPrice | null {
  const p = dealPrice(plan, source, price);
  if (p) DiscountPolicy.check({ listPrice: p.listPrice, price, maxPercent, planless: p.planless });
  return p;
}
