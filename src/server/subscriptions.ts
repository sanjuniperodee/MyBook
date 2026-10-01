import "server-only";
import type { OrderCancelled, OrderPaid, OrderPlaced, OrderRef } from "@/modules/ordering";
import type { Container } from "./container";

/**
 * Связи между контекстами через доменные события. Подписчик живёт на стороне потребителя:
 * «Заказы» не знают о CRM, а CRM реагирует на их события.
 */
export function registerSubscriptions(c: Container) {
  const crm = () => import("@/lib/crm/deals");
  const toOrder = (p: OrderRef) => ({ id: p.orderId, userId: p.userId, number: p.number, amount: p.amount });

  c.bus.subscribe<OrderPlaced>("ordering.order_placed", async (e) => (await crm()).onOrderCreated(toOrder(e.payload)), "crm.deal.order_created");
  c.bus.subscribe<OrderPaid>("ordering.order_paid", async (e) => (await crm()).onOrderPaid(toOrder(e.payload)), "crm.deal.order_paid");
  c.bus.subscribe<OrderCancelled>("ordering.order_cancelled", async (e) => (await crm()).onOrderCancelled(toOrder(e.payload)), "crm.deal.order_cancelled");
}
