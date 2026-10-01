import "server-only";
import { and, desc, eq, gte, ilike, isNull, lt, ne, or, sql, type SQL } from "drizzle-orm";
import { crmNotes, crmTasks, orders, orderStatuses } from "@/lib/db/schema";
import { executor } from "@/shared/infrastructure/database";
import { plans } from "@/config/site";

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
  if (f.status && (orderStatuses as readonly string[]).includes(f.status)) w.push(eq(orders.status, f.status as never));
  if (f.plan && plans.some((p) => p.id === f.plan)) w.push(eq(orders.plan, f.plan));
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
    db.select({ n: sql<number>`count(*)::int`, sum: sql<number>`coalesce(sum(${orders.amount}) filter (where ${orders.paidAt} is not null and ${orders.status} <> 'cancelled'),0)::int` }).from(orders).where(where),
  ]);
  return { list, n: totals.n, sum: totals.sum };
}

/** Выгрузка заказов в CSV по тем же фильтрам. */
export function orderExport(f: OrderFilters, viewerId: string) {
  return executor().select().from(orders).where(orderWhere(f, viewerId)).orderBy(desc(orders.createdAt)).limit(20_000);
}

/** Канбан производства: не отменённые, доставленные — только за последний месяц. */
export function productionBoard(deliveredSince: Date) {
  return executor()
    .select()
    .from(orders)
    .where(and(ne(orders.status, "cancelled"), or(ne(orders.status, "delivered"), gte(orders.updatedAt, deliveredSince))))
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
