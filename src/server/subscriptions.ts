import "server-only";
import type { OrderCancelled, OrderPaid, OrderPlaced, OrderRef } from "@/modules/ordering";
import type { UserRegistered } from "@/modules/identity";
import type { BookProgressed, BookStarted } from "@/modules/authoring";
import { runInBackground } from "@/shared/infrastructure/background";
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

  // Новый клиент — сделка в воронке (после ответа, чтобы не задерживать регистрацию).
  c.bus.subscribe<UserRegistered>("identity.user_registered", (e) => runInBackground(async () => (await import("@/lib/crm/hooks")).onClientRegistered(e.payload.userId)), "crm.deal.client_registered");

  // Книга начата / продвинулась — сделка идёт по воронке, поля сделки заполняются из книги.
  const hooks = () => import("@/lib/crm/hooks");
  c.bus.subscribe<BookStarted>("authoring.book_started", (e) => runInBackground(async () => (await hooks()).onBookStarted(e.payload.userId, { id: e.payload.bookId, ...e.payload })), "crm.deal.book_started");
  c.bus.subscribe<BookProgressed>("authoring.book_progressed", (e) => runInBackground(async () => (await hooks()).onAnswerSaved(e.payload.bookId, e.payload.userId)), "crm.deal.book_progressed");
}
