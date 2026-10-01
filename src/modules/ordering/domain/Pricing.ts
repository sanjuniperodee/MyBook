import { availableAddons, deliveryOptions, getPlan, type AddonId, type DeliveryId, type PlanId } from "@/config/site";

export interface PriceBreakdown {
  itemsAmount: number;
  discountAmount: number;
  deliveryAmount: number;
  addonsAmount: number;
  /** Допы, реально применённые к тарифу (недоступные отбрасываются). */
  addons: AddonId[];
  amount: number;
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
export function calculatePrice(planId: PlanId, quantity: number, delivery: DeliveryId | null, discount?: Discount | null, addonIds: readonly string[] = []): PriceBreakdown {
  const plan = getPlan(planId);
  if (!plan) throw new Error("Unknown plan");
  const qty = plan.printed ? Math.min(Math.max(1, Math.floor(quantity)), 20) : 1;
  const itemsAmount = plan.price + (qty - 1) * (plan.extraCopyPrice ?? plan.price);
  const discountAmount = discountFor(itemsAmount, discount);
  const deliveryAmount = plan.printed ? (deliveryOptions.find((d) => d.id === delivery)?.price ?? 0) : 0;
  const chosen = availableAddons(plan.id).filter((a) => addonIds.includes(a.id));
  const addonsAmount = chosen.reduce((s, a) => s + a.price, 0);
  return { itemsAmount, discountAmount, deliveryAmount, addonsAmount, addons: chosen.map((a) => a.id), amount: itemsAmount - discountAmount + deliveryAmount + addonsAmount };
}

export function normalizePromoCode(code: string) {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}
