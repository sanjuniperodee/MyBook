import { availableAddons, getDeliveryOptions, getPlan, type AddonId, type DeliveryId, type PlanId } from "@/config/site";
import type { AgreementGift } from "@/shared/domain/agreementGifts";

export interface PriceBreakdown {
  itemsAmount: number;
  discountAmount: number;
  deliveryAmount: number;
  addonsAmount: number;
  /** Допы, реально применённые к тарифу (недоступные отбрасываются). */
  addons: AddonId[];
  /** Внесено ранее менеджеру по договорённости (предоплата): уже оплачено, из «к оплате» вычтено. Нет — значит 0. */
  prepaidAmount?: number;
  /** Что клиент выбрал и получил бесплатно по договорённости (упаковка, доставка); нет — ничего. */
  gifted?: AgreementGift[];
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
  /** Что менеджер отдал бесплатно: если клиент выберет упаковку или доставку, они стоят 0 ₸ (сами не добавляются). */
  gifts?: readonly AgreementGift[];
}

export interface Discount {
  kind: "percent" | "fixed";
  value: number;
}

/** Скидка применяется к стоимости книг, но не к доставке. */
function discountFor(itemsAmount: number, discount: Discount | null | undefined): number {
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
  // Бесплатное по договорённости — только то, что клиент выбрал сам: упаковка в допах, платная доставка.
  const gifts = agreement && agreement.agreedTotal > 0 ? (agreement.gifts ?? []) : [];
  const listDelivery = plan.printed ? (getDeliveryOptions().find((d) => d.id === delivery)?.price ?? 0) : 0;
  const freeDelivery = gifts.includes("delivery") && listDelivery > 0;
  const deliveryAmount = freeDelivery ? 0 : listDelivery;
  const chosen = availableAddons(plan.id).filter((a) => addonIds.includes(a.id));
  const freeWrap = gifts.includes("giftwrap") && chosen.some((a) => a.id === "giftwrap");
  const addonsAmount = chosen.reduce((s, a) => s + (freeWrap && a.id === "giftwrap" ? 0 : a.price), 0);
  const total = itemsAmount - discountAmount + deliveryAmount + addonsAmount;
  const gifted: AgreementGift[] = [...(freeWrap ? (["giftwrap"] as const) : []), ...(freeDelivery ? (["delivery"] as const) : [])];
  const base = { itemsAmount, discountAmount, deliveryAmount, addonsAmount, addons: chosen.map((a) => a.id), ...(gifted.length ? { gifted } : {}) };
  if (!agreement || agreement.agreedTotal <= 0) return { ...base, amount: total };
  return applyAgreement({ ...base, amount: total }, agreement, itemsAmount - plan.price);
}

/**
 * Договорённая цена относится к книге: стоимость книг не выше согласованной — разница идёт в скидку (повысить цену договорённость
 * не может), дополнительные экземпляры (extraCopiesAmount) — по прайсу сверху. Доставка и допы считаются сверху всегда.
 * Внесённая предоплата вычитается из «к оплате» (но не больше итога). Промокод со скидкой, выгоднее договорённости, остаётся в силе.
 */
function applyAgreement(price: PriceBreakdown, agreement: Agreement, extraCopiesAmount = 0): PriceBreakdown {
  const books = price.itemsAmount - price.discountAmount;
  const extraDiscount = Math.max(0, books - (agreement.agreedTotal + extraCopiesAmount));
  const extras = price.deliveryAmount + price.addonsAmount;
  const total = books - extraDiscount + extras;
  const prepaid = Math.min(Math.max(0, Math.round(agreement.prepaid)), total);
  return { ...price, discountAmount: price.discountAmount + extraDiscount, prepaidAmount: prepaid, amount: total - prepaid };
}

/**
 * Условия оформления — одни для формы и для сервера: тариф (по договорённости он фиксирован) и договорённость для расчёта.
 * Дозаказ печатной версии к электронной: её оплата засчитывается как аванс, договорённость менеджера не применяется.
 * «Аванс» (advance): цену по договорённости не применяем (потолок бесконечен), но уже внесённые деньги вычитаем из «к оплате».
 */
export function checkoutTerms(input: { plan: PlanId; agreement: Agreement | null; mode?: "agreed" | "advance"; upgradeCredit?: number | null }): { plan: PlanId; agreement: Agreement | null; lockedPlan: PlanId | null } {
  if (input.upgradeCredit != null) return { plan: input.plan, agreement: { agreedTotal: Number.POSITIVE_INFINITY, prepaid: input.upgradeCredit }, lockedPlan: null };
  const found = input.agreement;
  if (!found) return { plan: input.plan, agreement: null, lockedPlan: null };
  const agreed = input.mode !== "advance";
  const lockedPlan = agreed && found.plan && getPlan(found.plan) ? found.plan : null;
  // Бесплатные упаковка и доставка — часть договорённости: «с нуля» (аванс) по обычной цене их нет.
  const gifts = agreed && found.gifts?.length ? { gifts: found.gifts } : {};
  return { plan: lockedPlan ?? input.plan, agreement: { agreedTotal: agreed ? found.agreedTotal : Number.POSITIVE_INFINITY, prepaid: found.prepaid, ...gifts }, lockedPlan };
}

/** Расчёт для формы оформления: итог как на сервере и отдельно скидка промокода и скидка по договорённости. */
export function quoteCheckout(input: { plan: PlanId; quantity: number; delivery: DeliveryId | null; discount: Discount | null; addons: readonly string[]; agreement: Agreement | null; mode?: "agreed" | "advance"; upgradeCredit?: number | null }) {
  const terms = checkoutTerms(input);
  const plain = calculatePrice(terms.plan, input.quantity, input.delivery, input.discount, input.addons);
  const price = terms.agreement ? calculatePrice(terms.plan, input.quantity, input.delivery, input.discount, input.addons, terms.agreement) : plain;
  return { ...terms, price, promoDiscount: plain.discountAmount, agreedDiscount: price.discountAmount - plain.discountAmount };
}

export function normalizePromoCode(code: string) {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}
