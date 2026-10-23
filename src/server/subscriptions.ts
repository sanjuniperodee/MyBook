import "server-only";
import { systemActor } from "@/shared/application";
import {
  DEAL_INVOICE_CLOSE_REASONS,
  dealInvoiceCancelledNote,
  type DealInvoiceClaimed,
  type DealInvoiceExtraMoney,
  type DealInvoicePaid,
  type DealInvoiceViewed,
  type OrderCancelled,
  type OrderOverpaid,
  type OrderPaid,
  type OrderPlaced,
  type OrderStatusChanged,
  type PaymentClaimed,
  type PostpayDue,
  type TrackingAdded,
} from "@/modules/ordering";
import type { UserRegistered } from "@/modules/identity";
import type { BookProgressed, BookStarted } from "@/modules/authoring";
import type { DealAssigned, DealClosed, DealCreated, DealStageChanged } from "@/modules/sales";
import { messagesFor } from "@/i18n/messages";
import { recipientPolicy } from "@/lib/content/kinds";
import { orderRuleSubject } from "@/shared/domain/orders";
import { isOrderRuleStatus } from "@/modules/automation/domain/meta";
import { runInBackground } from "@/shared/infrastructure/background";
import type { Container } from "./container";

/**
 * Связи между контекстами через доменные события. Подписчик живёт на стороне потребителя:
 * «Заказы» не знают о CRM, а продажи и автоматизации реагируют на их события.
 * Подписчики одного события вызываются по порядку регистрации.
 */
export function registerSubscriptions(c: Container) {
  const rules = () => c.automation.engine;
  const notify = () => import("@/modules/workspace");

  // ─── заказы → воронка продаж и правила CRM ───────────────────────────────
  // Сделка заказа — для правил: сообщение клиенту ищет её переписку, а пропуск пишется заметкой в неё.
  // У заказа может быть несколько сделок (пакет книг): byOrder отдаёт их по порядку создания — берём первую, всегда одну и ту же.
  const orderDeal = async (orderId: string) => (await c.sales.deals.byOrder(orderId))[0]?.id ?? null;
  c.bus.subscribe<OrderPlaced>("ordering.order_placed", (e) => c.sales.funnel.orderCreated({ id: e.payload.orderId, ...e.payload, amount: e.payload.amount + (e.payload.prepaid ?? 0), dealId: e.payload.agreementDealId ?? null }).then(() => undefined), "crm.deal.order_created");
  // Ответственный заказа — ответственный его сделки (deals-d15): фильтр «мои» в заказах и на доске производства. Только
  // что оформленный заказ ничей; сотрудник, которого уже нет, — заказ остаётся ничьим.
  c.bus.subscribe<OrderPlaced>(
    "ordering.order_placed",
    async (e) => {
      const deal = (await c.sales.deals.byOrder(e.payload.orderId))[0];
      if (deal?.assigneeId) await c.ordering.orders.assign(e.payload.orderId, deal.assigneeId, systemActor("crm")).catch((err) => console.error("[crm] order assignee", err));
    },
    "crm.order.assignee",
  );
  // После привязки заказа к сделке (подписчики — по порядку регистрации).
  c.bus.subscribe<OrderPlaced>(
    "ordering.order_placed",
    async (e) => rules().run("order.created", { subject: e.payload.orderId, orderId: e.payload.orderId, clientId: e.payload.userId, dealId: await orderDeal(e.payload.orderId) }),
    "crm.automation.order_created",
  );
  // Статус заказа — один раз на статус (откат и повторный перевод клиенту не повторяются); трек — один раз на номер
  // (исправили опечатку — клиент получит верный). Событие правил — только «В печати», «Отправлен», «Доставлен»: откат в
  // «Оплачен» или «Ждёт оплаты» клиенту не сообщается (оплату ловит «Заказ оплачен»), даже правилом «любой статус».
  c.bus.subscribe<OrderStatusChanged>(
    "ordering.order_status_changed",
    async (e) => {
      const p = e.payload;
      if (!isOrderRuleStatus(p.to)) return;
      await rules().run("order.status_changed", { subject: orderRuleSubject.status(p.orderId, p.to), orderId: p.orderId, clientId: p.userId, dealId: await orderDeal(p.orderId), orderStatus: p.to });
    },
    "crm.automation.order_status_changed",
  );
  c.bus.subscribe<TrackingAdded>(
    "ordering.tracking_added",
    async (e) => {
      const p = e.payload;
      await rules().run("order.tracking_added", { subject: orderRuleSubject.track(p.orderId, p.trackingNumber), orderId: p.orderId, clientId: p.userId, dealId: await orderDeal(p.orderId) });
    },
    "crm.automation.order_tracking_added",
  );
  c.bus.subscribe<OrderPaid>(
    "ordering.order_paid",
    async (e) => {
      const dealId = await c.sales.funnel.orderPaid({ id: e.payload.orderId, userId: e.payload.userId, amount: e.payload.amount + (e.payload.prepaid ?? 0) });
      await rules().run("order.paid", { subject: e.payload.orderId, orderId: e.payload.orderId, clientId: e.payload.userId, dealId });
    },
    "crm.deal.order_paid",
  );
  c.bus.subscribe<OrderCancelled>("ordering.order_cancelled", (e) => c.sales.funnel.orderCancelled(e.payload.orderId, e.payload.number), "crm.deal.order_cancelled");

  // ─── заказы → ответственному менеджеру сделки: клиент оформил заказ или сообщил об оплате ──
  const tellManager = async (orderId: string, title: (dealNumber: number) => string, body: (dealTitle: string) => string) => {
    for (const d of await c.sales.deals.byOrder(orderId)) {
      if (d.assigneeId) await (await notify()).notify([d.assigneeId], { kind: "deal", title: title(d.number), body: body(d.title), link: `/admin/deals/${d.id}` });
    }
  };
  c.bus.subscribe<OrderPlaced>(
    "ordering.order_placed",
    (e) => tellManager(e.payload.orderId, (n) => `Клиент оформил заказ №${e.payload.number} (сделка №${n})`, (t) => `${t}${e.payload.prepaid ? ` · предоплата ${e.payload.prepaid.toLocaleString("ru-RU")} ₸ учтена` : ""}`),
    "crm.notify.order_placed",
  );
  // Деньги по заказу требуют решения: переплата (возврат или зачёт) и постоплата после доставки — задача ответственному
  // сделки со сроком «2 рабочих часа» (ночью — к 11:00 утра) и напоминанием. Ответственного нет — задача ничья: её видят
  // все в «Просрочено» и в бейдже, напоминание — всем с deals.view (tasks-d4). Повтор события (outbox повторяет упавший
  // подписчик) задачу не дублирует, а уведомление дойдёт.
  const ORDER_TASK_WORK_MIN = 120;
  const orderTask = async (orderId: string, title: string) => {
    for (const d of await c.sales.deals.byOrder(orderId)) {
      const dueAt = await c.workspace.schedule.addWorkMinutes(c.clock.now(), ORDER_TASK_WORK_MIN);
      await c.clients.tasks.createSystem({ title, kind: "task", dueAt, orderId, dealId: d.id, assigneeId: d.assigneeId, once: true });
      await (await notify()).staffNotifier.notifyOwnerOr(d.assigneeId, "orders.view", { kind: "task", title, body: d.title, link: `/admin/deals/${d.id}` });
    }
  };
  c.bus.subscribe<OrderOverpaid>("ordering.order_overpaid", (e) => orderTask(e.payload.orderId, `Переплата ${e.payload.overpaid.toLocaleString("ru-RU")} ₸ по заказу №${e.payload.number} — оформите возврат или зачёт`), "crm.task.order_overpaid");
  c.bus.subscribe<PostpayDue>("ordering.postpay_due", (e) => orderTask(e.payload.orderId, `Получить постоплату ${e.payload.outstanding.toLocaleString("ru-RU")} ₸ по заказу №${e.payload.number}`), "crm.task.postpay_due");
  // Внесено по договорённости больше итога заказа — вернуть разницу (после привязки заказа к сделке: подписчики — по порядку).
  c.bus.subscribe<OrderPlaced>(
    "ordering.order_placed",
    async (e) => {
      if (e.payload.prepaidExcess && e.payload.prepaidExcess > 0) await orderTask(e.payload.orderId, `Переплата ${e.payload.prepaidExcess.toLocaleString("ru-RU")} ₸ по договорённости (заказ №${e.payload.number}) — оформите возврат`);
    },
    "crm.task.prepaid_excess",
  );
  // Стоимость доставки рассчитывается индивидуально: в заказ она не вошла — менеджер считает её и согласует с клиентом.
  c.bus.subscribe<OrderPlaced>(
    "ordering.order_placed",
    async (e) => {
      const d = e.payload.deliveryQuoted ?? (e.payload.deliveryAbroad ? { ...e.payload.deliveryAbroad, method: "abroad" } : null);
      if (d) await orderTask(e.payload.orderId, `Рассчитать доставку (${d.method === "abroad" ? "другая страна: " : ""}${[d.country, d.city].filter(Boolean).join(", ") || "адрес не указан"}) по заказу №${e.payload.number} и согласовать с клиентом стоимость и оплату`);
    },
    "crm.task.delivery_abroad",
  );
  c.bus.subscribe<PaymentClaimed>("ordering.payment_claimed", (e) => tellManager(e.payload.orderId, () => `Проверьте оплату заказа №${e.payload.number}`, (t) => `${t} · клиент сообщил, что оплатил`), "crm.notify.payment_claimed");

  // ─── счёт из чата → CRM: заметки и уведомления (каждый подписчик идемпотентен: outbox повторяет только упавших) ──
  // Клиент, привязка и доступ в кабинет — надёжный шаг планировщика по состоянию счёта (access_status='due' ставит
  // оплата); здесь только быстрый путь: не ждать минутного прохода — клиент получает доступ сразу после оплаты.
  const access = () => c.invoiceAccess;
  c.bus.subscribe<DealInvoicePaid>("ordering.deal_invoice_paid", (e) => access().paidNote(e.payload), "crm.invoice.paid_note");
  c.bus.subscribe<DealInvoicePaid>("ordering.deal_invoice_paid", (e) => access().paidNotify(e.payload), "crm.invoice.paid_notify");
  c.bus.subscribe<DealInvoicePaid>("ordering.deal_invoice_paid", (e) => runInBackground(() => access().process(e.payload.invoiceId)), "crm.invoice.access_now");
  c.bus.subscribe<DealInvoiceExtraMoney>("ordering.deal_invoice_extra_money", (e) => access().extraMoney(e.payload), "crm.invoice.extra_money");
  c.bus.subscribe<DealInvoiceClaimed>("ordering.deal_invoice_claimed", (e) => access().claimed(e.payload), "crm.invoice.claimed");
  c.bus.subscribe<DealInvoiceViewed>("ordering.deal_invoice_viewed", (e) => access().viewed(e.payload), "crm.invoice.viewed");

  // ─── заказы → приглашения: друг оплатил заказ по коду-приглашению — награда тому, кто пригласил ──
  c.bus.subscribe<OrderPaid>(
    "ordering.order_paid",
    (e) => c.referrals.service.onOrderPaid({ orderId: e.payload.orderId, number: e.payload.number, userId: e.payload.userId, promoCode: e.payload.promoCode }),
    "referrals.reward",
  );

  // ─── клиент и книга → воронка (после ответа: клиент не ждёт CRM, ошибка CRM не ломает его сценарий) ──
  c.bus.subscribe<UserRegistered>("identity.user_registered", (e) => runInBackground(() => c.sales.funnel.advance(e.payload.userId, "registered")), "crm.deal.client_registered");
  c.bus.subscribe<BookStarted>(
    "authoring.book_started",
    (e) =>
      runInBackground(() => {
        const p = e.payload;
        // Повод, дата и адресат из книги сразу попадают в поля сделки (подписи — по-русски, как в CRM).
        const occasion = p.occasion ? (messagesFor("ru").common.occasions as Record<string, { label: string }>)[p.occasion]?.label : undefined;
        const fields = { ...(occasion ? { occasion } : {}), ...(p.occasionDate ? { event_date: p.occasionDate } : {}), ...(p.recipientName && recipientPolicy(p.theme) !== "none" ? { recipient: p.recipientName } : {}) };
        return c.sales.funnel.bookStarted(p.userId, p, fields);
      }),
    "crm.deal.book_started",
  );
  c.bus.subscribe<BookProgressed>("authoring.book_progressed", (e) => runInBackground(() => c.sales.funnel.bookProgressed(e.payload.bookId, e.payload.userId)), "crm.deal.book_progressed");

  // ─── сделки → правила CRM и уведомления сотрудникам ──────────────────────
  c.bus.subscribe<DealCreated>(
    "sales.deal_created",
    async (e) => rules().run("deal.created", { subject: e.payload.dealId, dealId: e.payload.dealId, clientId: e.payload.clientId, source: e.payload.source, stageId: e.payload.stageId }),
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
  // Чат идёт за сделкой: новый ответственный получает её переписку, прежний перестаёт её видеть и вести.
  c.bus.subscribe<DealAssigned>(
    "sales.deal_assigned",
    async (e) => {
      if (e.payload.assigneeId) await c.messaging.chats.assignDealConversations(e.payload.dealId, e.payload.assigneeId);
    },
    "crm.chats.follow_deal",
  );
  // Задачи идут за сделкой: открытые задачи прежнего ответственного и ничьи (ночная задача бота) — новому, напоминание
  // ему заново. Повтор из outbox после следующей передачи не уводит задачи к тому, у кого сделки уже нет.
  c.bus.subscribe<DealAssigned>(
    "sales.deal_assigned",
    async (e) => {
      const p = e.payload;
      if (!p.assigneeId || (await c.sales.deals.findById(p.dealId))?.assigneeId !== p.assigneeId) return;
      await c.clients.tasks.followDeal({ dealId: p.dealId, from: p.fromAssigneeId, to: p.assigneeId });
    },
    "crm.tasks.follow_deal",
  );
  // Сделка закрыта (успех, отказ, отклонена) — её открытый счёт из чата отменяется: платить по закрытой сделке нельзя.
  // Счёт Kaspi на номер по нему закроет сверка платежей.
  c.bus.subscribe<DealClosed>(
    "sales.deal_closed",
    async (e) => {
      const p = e.payload;
      // Повтор из outbox мог прийти, когда сделку уже вернули в работу и выставили новый счёт — его не трогаем.
      const deal = await c.sales.deals.findById(p.dealId);
      if (!deal || (await c.sales.deals.stage(deal.stageId))?.kind === "open") return;
      const cancelled = await c.ordering.invoices.cancelOpenFor(p.dealId, p.outcome === "won" ? DEAL_INVOICE_CLOSE_REASONS.dealWon : DEAL_INVOICE_CLOSE_REASONS.dealLost(p.reason));
      if (cancelled) await c.sales.deals.note({ id: p.dealId, clientId: p.clientId }, dealInvoiceCancelledNote(cancelled), null);
    },
    "ordering.invoices.cancel_on_deal_closed",
  );
  c.bus.subscribe<DealStageChanged>(
    "sales.deal_stage_changed",
    async (e) => rules().run("deal.stage_changed", { subject: `${e.payload.dealId}:${e.payload.stageId}:${e.payload.at}`, dealId: e.payload.dealId, clientId: e.payload.clientId, stageId: e.payload.stageId, source: e.payload.source }),
    "crm.automation.deal_stage_changed",
  );
}
