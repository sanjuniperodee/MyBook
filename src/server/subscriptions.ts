import "server-only";
import type { OrderCancelled, OrderPaid, OrderPlaced } from "@/modules/ordering";
import type { UserRegistered } from "@/modules/identity";
import type { BookProgressed, BookStarted } from "@/modules/authoring";
import type { DealCreated, DealStageChanged } from "@/modules/sales";
import { messagesFor } from "@/i18n/messages";
import { runInBackground } from "@/shared/infrastructure/background";
import type { Container } from "./container";

/**
 * Связи между контекстами через доменные события. Подписчик живёт на стороне потребителя:
 * «Заказы» не знают о CRM, а продажи и автоматизации реагируют на их события.
 * Подписчики одного события вызываются по порядку регистрации.
 */
export function registerSubscriptions(c: Container) {
  const automations = () => import("@/lib/crm/automations");
  const notify = () => import("@/lib/crm/notify");

  // ─── заказы → воронка продаж и правила CRM ───────────────────────────────
  c.bus.subscribe<OrderPlaced>("ordering.order_placed", (e) => c.sales.funnel.orderCreated({ id: e.payload.orderId, ...e.payload }).then(() => undefined), "crm.deal.order_created");
  c.bus.subscribe<OrderPlaced>("ordering.order_placed", async (e) => (await automations()).runTrigger("order.created", { subject: e.payload.orderId, orderId: e.payload.orderId, clientId: e.payload.userId }), "crm.automation.order_created");
  c.bus.subscribe<OrderPaid>(
    "ordering.order_paid",
    async (e) => {
      const dealId = await c.sales.funnel.orderPaid({ id: e.payload.orderId, userId: e.payload.userId, amount: e.payload.amount });
      await (await automations()).runTrigger("order.paid", { subject: e.payload.orderId, orderId: e.payload.orderId, clientId: e.payload.userId, dealId });
    },
    "crm.deal.order_paid",
  );
  c.bus.subscribe<OrderCancelled>("ordering.order_cancelled", (e) => c.sales.funnel.orderCancelled(e.payload.orderId), "crm.deal.order_cancelled");

  // ─── клиент и книга → воронка (после ответа: клиент не ждёт CRM, ошибка CRM не ломает его сценарий) ──
  c.bus.subscribe<UserRegistered>("identity.user_registered", (e) => runInBackground(() => c.sales.funnel.advance(e.payload.userId, "registered")), "crm.deal.client_registered");
  c.bus.subscribe<BookStarted>(
    "authoring.book_started",
    (e) =>
      runInBackground(() => {
        const p = e.payload;
        // Повод, дата и адресат из книги сразу попадают в поля сделки (подписи — по-русски, как в CRM).
        const occasion = p.occasion ? (messagesFor("ru").common.occasions as Record<string, { label: string }>)[p.occasion]?.label : undefined;
        const fields = { ...(occasion ? { occasion } : {}), ...(p.occasionDate ? { event_date: p.occasionDate } : {}), ...(p.recipientName ? { recipient: p.recipientName } : {}) };
        return c.sales.funnel.bookStarted(p.userId, p, fields);
      }),
    "crm.deal.book_started",
  );
  c.bus.subscribe<BookProgressed>("authoring.book_progressed", (e) => runInBackground(() => c.sales.funnel.bookProgressed(e.payload.bookId, e.payload.userId)), "crm.deal.book_progressed");

  // ─── сделки → правила CRM и уведомления сотрудникам ──────────────────────
  c.bus.subscribe<DealCreated>(
    "sales.deal_created",
    async (e) => (await automations()).runTrigger("deal.created", { subject: e.payload.dealId, dealId: e.payload.dealId, clientId: e.payload.clientId, source: e.payload.source, stageId: e.payload.stageId }),
    "crm.automation.deal_created",
  );
  // После правил: ответственного могло назначить правило «распределить по кругу».
  c.bus.subscribe<DealCreated>(
    "sales.deal_created",
    async (e) => {
      const deal = await c.sales.deals.findById(e.payload.dealId);
      if (deal?.assigneeId && deal.assigneeId !== e.payload.createdById) await (await notify()).notify([deal.assigneeId], { kind: "deal", title: `Новая сделка №${deal.number}`, body: deal.title, link: `/admin/deals/${deal.id}` });
    },
    "crm.notify.deal_created",
  );
  c.bus.subscribe<DealStageChanged>(
    "sales.deal_stage_changed",
    async (e) => (await automations()).runTrigger("deal.stage_changed", { subject: `${e.payload.dealId}:${e.payload.stageId}:${e.payload.at}`, dealId: e.payload.dealId, clientId: e.payload.clientId, stageId: e.payload.stageId, source: e.payload.source }),
    "crm.automation.deal_stage_changed",
  );
}
