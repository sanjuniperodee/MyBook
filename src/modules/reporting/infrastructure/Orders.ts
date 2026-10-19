import "server-only";
import { and, desc, eq, gte, ilike, inArray, isNull, lt, ne, or, sql, type SQL } from "drizzle-orm";
import { ORDER_STATUSES, orderRuleSubject } from "@/shared/domain/orders";
import { crmAutomationRuns, crmAutomations, crmConversations, crmDeals, crmNotes, crmTasks, orders } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";
import { getPlans } from "@/config/site";

export interface OrderFilters {
  status?: string;
  q?: string;
  plan?: string;
  assignee?: string; // "me" | "none" | uuid
  from?: string; // YYYY-MM-DD
  to?: string;
}

/** Условия выборки заказов — общие для таблицы и CSV-выгрузки. */
function orderWhere(f: OrderFilters, adminId: string): SQL | undefined {
  const w: SQL[] = [];
  if (f.status && (ORDER_STATUSES as readonly string[]).includes(f.status)) w.push(eq(orders.status, f.status as never));
  if (f.plan && getPlans().some((p) => p.id === f.plan)) w.push(eq(orders.plan, f.plan));
  if (f.assignee === "me") w.push(eq(orders.assigneeId, adminId));
  else if (f.assignee === "none") w.push(isNull(orders.assigneeId));
  else if (f.assignee && /^[0-9a-f-]{36}$/i.test(f.assignee)) w.push(eq(orders.assigneeId, f.assignee));
  if (f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from)) w.push(gte(orders.createdAt, new Date(`${f.from}T00:00:00`)));
  if (f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to)) w.push(lt(orders.createdAt, new Date(new Date(`${f.to}T00:00:00`).getTime() + 86_400_000)));
  const q = f.q?.trim();
  if (q) {
    const s = `%${q}%`;
    const num = Number(q.replace(/\D/g, ""));
    w.push(or(ilike(orders.contactName, s), ilike(orders.contactEmail, s), ilike(orders.contactPhone, s), ilike(orders.city, s), ...(num && q.length < 8 ? [eq(orders.number, num)] : []))!);
  }
  return w.length ? and(...w) : undefined;
}

/** Страница таблицы заказов и итоги по фильтру. */
export async function orderList(f: OrderFilters, viewerId: string, page: number, pageSize: number) {
  const db = executor();
  const where = orderWhere(f, viewerId);
  const [list, [totals]] = await Promise.all([
    db.select().from(orders).where(where).orderBy(desc(orders.createdAt)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ n: sql<number>`count(*)::int`, sum: sql<number>`coalesce(sum(${orders.prepaidAmount} + case when ${orders.paidAt} is not null then greatest(${orders.receivedAmount}, ${orders.amount}) else ${orders.receivedAmount} end) filter (where ${orders.status} <> 'cancelled'),0)::int` }).from(orders).where(where),
  ]);
  return { list, n: totals.n, sum: totals.sum };
}

/** Выгрузка заказов в CSV по тем же фильтрам. */
export function orderExport(f: OrderFilters, viewerId: string) {
  return executor().select().from(orders).where(orderWhere(f, viewerId)).orderBy(desc(orders.createdAt)).limit(20_000);
}

/** Канбан производства: не отменённые, доставленные — только за последний месяц. Электронные версии печати не требуют — их здесь нет. */
export function productionBoard(deliveredSince: Date) {
  return executor()
    .select()
    .from(orders)
    .where(and(ne(orders.status, "cancelled"), ne(orders.plan, "digital"), or(ne(orders.status, "delivered"), gte(orders.updatedAt, deliveredSince))))
    .orderBy(sql`${orders.desiredDate} asc nulls last`, desc(orders.createdAt))
    .limit(500);
}

/** CRM в карточке заказа: задачи по заказу, лента клиента, число заказов и LTV клиента. */
export async function orderCrm(order: { id: string; userId: string }) {
  const db = executor();
  const [taskRows, noteRows, [clientStats]] = await Promise.all([
    db.select().from(crmTasks).where(eq(crmTasks.orderId, order.id)).orderBy(sql`${crmTasks.doneAt} nulls first`, crmTasks.dueAt),
    db.select().from(crmNotes).where(eq(crmNotes.clientId, order.userId)).orderBy(desc(crmNotes.createdAt)).limit(30),
    db
      .select({ n: sql<number>`count(*)::int`, ltv: sql<number>`coalesce(sum(${orders.amount}) filter (where ${orders.paidAt} is not null),0)::int` })
      .from(orders)
      .where(and(eq(orders.userId, order.userId), ne(orders.status, "cancelled"))),
  ]);
  return { taskRows, noteRows, clientStats };
}

/**
 * Что получит клиент при смене статуса заказа — для подписи в карточке заказа: включённые правила на события заказа,
 * которые пишут клиенту (действие «Отправить сообщение» с текстом), их условие «статус» и «рабочее время», о чём каждое
 * уже писало этому заказу (журнал срабатываний по crm_auto_runs_idx: статусы, сохранённый трек, оплата — повторно правило
 * не напишет), сделка заказа и есть ли переписка в WhatsApp — по сделке заказа или по клиенту (crm_conv_deal_idx,
 * crm_conv_client_idx).
 */
export async function orderNotice(order: { id: string; userId: string; trackingNumber: string | null }) {
  const db = executor();
  const [rows, [deal]] = await Promise.all([
    db
      .select({ id: crmAutomations.id, trigger: crmAutomations.trigger, conditions: crmAutomations.conditions, actions: crmAutomations.actions })
      .from(crmAutomations)
      .where(and(eq(crmAutomations.active, true), sql`${crmAutomations.trigger} like 'order.%'`)),
    db.select({ id: crmDeals.id }).from(crmDeals).where(eq(crmDeals.orderId, order.id)).limit(1),
  ]);
  const rules = rows.filter((r) => r.actions.some((a) => a.type === "send_message" && !!a.text?.trim()));
  // Объект срабатывания → о чём правило писало: «paid» (оплата), статус, трек-номер.
  const about = new Map<string, string>([[order.id, "paid"], ...ORDER_STATUSES.map((st) => [orderRuleSubject.status(order.id, st), st] as const)]);
  if (order.trackingNumber) about.set(orderRuleSubject.track(order.id, order.trackingNumber), order.trackingNumber);
  const [[chat], runs] = await Promise.all([
    db
      .select({ id: crmConversations.id })
      .from(crmConversations)
      .where(and(inArray(crmConversations.channel, ["whatsapp", "wapi"]), or(eq(crmConversations.clientId, order.userId), deal ? eq(crmConversations.dealId, deal.id) : undefined)))
      .limit(1),
    rules.length
      ? db
          .select({ automationId: crmAutomationRuns.automationId, subject: crmAutomationRuns.subject })
          .from(crmAutomationRuns)
          .where(and(inArray(crmAutomationRuns.automationId, rules.map((r) => r.id)), inArray(crmAutomationRuns.subject, [...about.keys()])))
          .limit(rules.length * about.size)
      : [],
  ]);
  return {
    dealId: deal?.id ?? null,
    whatsappChat: !!chat,
    rules: rules.map((r) => ({
      trigger: r.trigger,
      orderStatus: r.conditions?.orderStatus ? String(r.conditions.orderStatus) : null,
      hours: r.conditions?.hours === "work" || r.conditions?.hours === "off" ? r.conditions.hours : null,
      // Оплата — subject «id заказа» только у «Заказ оплачен» (у «Заказ оформлен» он тот же, но к форме статуса не относится).
      done: runs.filter((x) => x.automationId === r.id && (x.subject !== order.id || r.trigger === "order.paid")).map((x) => about.get(x.subject)!),
    })),
  };
}
