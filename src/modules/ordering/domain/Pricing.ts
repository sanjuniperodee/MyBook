import { availableAddons, deliveryOptions, getPlan, type AddonId, type DeliveryId, type PlanId } from "@/config/site";

export interface PriceBreakdown {
  itemsAmount: number;
  discountAmount: number;
  deliveryAmount: number;
  addonsAmount: number;
  /** Допы, реально применённые к тарифу (недоступные отбрасываются). */
  addons: AddonId[];
  /** Внесено ранее менеджеру по договорённости (предоплата): уже оплачено, из «к оплате» вычтено. Нет — значит 0. */
  prepaidAmount?: number;
  /** К оплате сейчас. */
  amount: number;
}

/** Договорённость менеджера с клиентом: итоговая цена заказа и сколько уже внесено. */
export interface Agreement {
  agreedTotal: number;
  prepaid: number;
}

export interface Discount {
  kind: "percent" | "fixed";
  value: number;
}

/** Скидка применяется к стоимости книг, но не к доставке. */
export function discountFor(itemsAmount: number, discount: Discount | null | undefined): number {
  if (!discount || discount.value <= 0) return 0;
  const raw = discount.kind === "percent" ? Math.round((itemsAmount * Math.min(discount.value, 100)) / 100) : discount.value;
  return Math.min(Math.max(0, raw), itemsAmount);
}

/** Расчёт стоимости заказа. Единственный источник правды — сервер пересчитывает цену при оформлении. */
export function calculatePrice(planId: PlanId, quantity: number, delivery: DeliveryId | null, discount?: Discount | null, addonIds: readonly string[] = [], agreement?: Agreement | null): PriceBreakdown {
  const plan = getPlan(planId);
  if (!plan) throw new Error("Unknown plan");
  const qty = plan.printed ? Math.min(Math.max(1, Math.floor(quantity)), 20) : 1;
  const itemsAmount = plan.price + (qty - 1) * (plan.extraCopyPrice ?? plan.price);
  const discountAmount = discountFor(itemsAmount, discount);
  const deliveryAmount = plan.printed ? (deliveryOptions.find((d) => d.id === delivery)?.price ?? 0) : 0;
  const chosen = availableAddons(plan.id).filter((a) => addonIds.includes(a.id));
  const addonsAmount = chosen.reduce((s, a) => s + a.price, 0);
  const total = itemsAmount - discountAmount + deliveryAmount + addonsAmount;
  const base = { itemsAmount, discountAmount, deliveryAmount, addonsAmount, addons: chosen.map((a) => a.id) };
  if (!agreement || agreement.agreedTotal <= 0) return { ...base, amount: total };
  return applyAgreement({ ...base, amount: total }, agreement);
}

/**
 * Договорённая цена: итог заказа не выше согласованного — разница идёт в скидку (повысить цену договорённость не может),
 * а внесённая предоплата вычитается из «к оплате» (но не больше итога). Промокод со скидкой, выгоднее договорённости, остаётся в силе.
 */
export function applyAgreement(price: PriceBreakdown, agreement: Agreement): PriceBreakdown {
  const total = price.amount;
  const extraDiscount = Math.max(0, total - agreement.agreedTotal);
  const agreedTotal = total - extraDiscount;
  const prepaid = Math.min(Math.max(0, Math.round(agreement.prepaid)), agreedTotal);
  return { ...price, discountAmount: price.discountAmount + extraDiscount, prepaidAmount: prepaid, amount: agreedTotal - prepaid };
}

export function normalizePromoCode(code: string) {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}
