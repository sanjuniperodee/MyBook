import "server-only";
import { getSetting } from "@/modules/workspace";
import { DiscountPolicy } from "@/shared/domain/discount";
import { audit, can, type Staff } from "./access";

/**
 * Лимит скидки сотрудника от прайса, % — один для всех точек продажи (счёт из чата, бюджет и тариф договорённости, новая
 * сделка, «Новый клиент», «Сделки по договорённости»): настройка CRM crm.maxDiscount. null — без лимита: право
 * prices.discount_unlimited (руководитель — всегда).
 */
export async function discountLimit(staff: Staff): Promise<number | null> {
  return can(staff, "prices.discount_unlimited") ? null : DiscountPolicy.readLimit(await getSetting("crm.maxDiscount"));
}

/** Где сотрудник назначил цену: счёт из чата, бюджет сделки, тариф договорённости, новая сделка, формы клиента. */
export type DiscountVia = "invoice" | "budget" | "plan" | "deal" | "client" | "client_deals";

/**
 * Цена ниже прайса — в журнал deal.discount: на сколько процентов, прайс и цена, тариф, лимит сотрудника (null — продал
 * без лимита) и откуда. Цена не ниже прайса — не пишем.
 */
export async function auditDiscount(
  staff: Staff,
  target: { entity: "deal" | "client"; id: string },
  price: { plan: string | null; listPrice: number; price: number; percent: number; planless?: boolean } | null,
  limit: number | null,
  via: DiscountVia,
  extra: Record<string, unknown> = {},
) {
  if (!price || price.percent <= 0) return;
  await audit(staff, "deal.discount", target.entity, target.id, { via, percent: price.percent, listPrice: price.listPrice, price: price.price, plan: price.plan, ...(price.planless ? { planless: true } : {}), limit, ...extra });
}
