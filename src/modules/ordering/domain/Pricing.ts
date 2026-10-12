import { availableAddons, getDeliveryOptions, getPlan, type AddonId, type DeliveryId, type PlanId } from "@/config/site";

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

/**
 * Договорённость менеджера с клиентом: цена книги (первого экземпляра выбранного тарифа), сколько уже внесено и тариф, на который договорились.
 * Доставка, допы и дополнительные экземпляры считаются сверху.
 */
export interface Agreement {
  agreedTotal: number;
  prepaid: number;
  /** Тариф договорённости: при заказе по ней он фиксирован. Нет — клиент выбирает тариф сам. */
  plan?: PlanId | null;
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
  const deliveryAmount = plan.printed ? (getDeliveryOptions().find((d) => d.id === delivery)?.price ?? 0) : 0;
  const chosen = availableAddons(plan.id).filter((a) => addonIds.includes(a.id));
  const addonsAmount = chosen.reduce((s, a) => s + a.price, 0);
  const total = itemsAmount - discountAmount + deliveryAmount + addonsAmount;
  const base = { itemsAmount, discountAmount, deliveryAmount, addonsAmount, addons: chosen.map((a) => a.id) };
  if (!agreement || agreement.agreedTotal <= 0) return { ...base, amount: total };
  return applyAgreement({ ...base, amount: total }, agreement, itemsAmount - plan.price);
}

/**
 * Договорённая цена относится к книге: стоимость книг не выше согласованной — разница идёт в скидку (повысить цену договорённость
 * не может), дополнительные экземпляры (extraCopiesAmount) — по прайсу сверху. Доставка и допы считаются сверху всегда.
 * Внесённая предоплата вычитается из «к оплате» (но не больше итога). Промокод со скидкой, выгоднее договорённости, остаётся в силе.
 */
export function applyAgreement(price: PriceBreakdown, agreement: Agreement, extraCopiesAmount = 0): PriceBreakdown {
  const books = price.itemsAmount - price.discountAmount;
  const extraDiscount = Math.max(0, books - (agreement.agreedTotal + extraCopiesAmount));
  const extras = price.deliveryAmount + price.addonsAmount;
  const total = books - extraDiscount + extras;
  const prepaid = Math.min(Math.max(0, Math.round(agreement.prepaid)), total);
  return { ...price, discountAmount: price.discountAmount + extraDiscount, prepaidAmount: prepaid, amount: total - prepaid };
}

export function normalizePromoCode(code: string) {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}
