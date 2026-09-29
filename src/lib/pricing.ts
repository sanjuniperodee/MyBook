import { deliveryOptions, getPlan, type DeliveryId, type PlanId } from "@/config/site";

export interface PriceBreakdown {
  itemsAmount: number;
  deliveryAmount: number;
  amount: number;
}

/** Расчёт стоимости заказа. Единственный источник правды — сервер пересчитывает цену при оформлении. */
export function calculatePrice(planId: PlanId, quantity: number, delivery: DeliveryId | null): PriceBreakdown {
  const plan = getPlan(planId);
  if (!plan) throw new Error("Unknown plan");
  const qty = plan.printed ? Math.min(Math.max(1, Math.floor(quantity)), 20) : 1;
  const itemsAmount = plan.price + (qty - 1) * (plan.extraCopyPrice ?? plan.price);
  const deliveryAmount = plan.printed ? (deliveryOptions.find((d) => d.id === delivery)?.price ?? 0) : 0;
  return { itemsAmount, deliveryAmount, amount: itemsAmount + deliveryAmount };
}
