import "server-only";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, ne, or, sql } from "drizzle-orm";
import { crmTasks, orderEvents, orders, users } from "@/lib/db/schema";
import { executor } from "@/shared/infrastructure/database";
import { iso, localDay, SHOP_TZ } from "./time";

// Константа, не пользовательский ввод — можно вставлять в SQL как литерал (нужно для GROUP BY).
const tzSql = sql.raw(`'${SHOP_TZ}'`);

/** Обзор магазина за период: выручка по дням, сравнение с прошлым периодом, воронка когорты, дедлайны, задачи, внимание. */
export async function dashboard(period: number, staffId: string) {
  const db = executor();
  const admin = { id: staffId };
  // Границы периода в часовом поясе магазина
  const startLocal = localDay(-(period - 1));
  const prevStartLocal = localDay(-(2 * period - 1));
  const start = sql`(${iso(startLocal)}::date at time zone ${tzSql})`;
  const prevStart = sql`(${iso(prevStartLocal)}::date at time zone ${tzSql})`;
  const paidDay = sql<string>`to_char((${orders.paidAt} at time zone ${tzSql})::date, 'YYYY-MM-DD')`;
  const notCancelled = ne(orders.status, "cancelled");

  const [daily, [cur], [prev], [newUsers], funnelRows, byPlan, deadlines, tasks, attention, events] = await Promise.all([
    db
      .select({ d: paidDay, sum: sql<number>`sum(${orders.amount})::int`, n: sql<number>`count(*)::int` })
      .from(orders)
      .where(and(isNotNull(orders.paidAt), sql`${orders.paidAt} >= ${start}`, notCancelled))
      .groupBy(paidDay),
    db
      .select({ sum: sql<number>`coalesce(sum(${orders.amount}),0)::int`, n: sql<number>`count(*)::int` })
      .from(orders)
      .where(and(isNotNull(orders.paidAt), sql`${orders.paidAt} >= ${start}`, notCancelled)),
    db
      .select({ sum: sql<number>`coalesce(sum(${orders.amount}),0)::int`, n: sql<number>`count(*)::int` })
      .from(orders)
      .where(and(isNotNull(orders.paidAt), sql`${orders.paidAt} >= ${prevStart}`, sql`${orders.paidAt} < ${start}`, notCancelled)),
    db
      .select({
        cur: sql<number>`count(*) filter (where ${users.createdAt} >= ${start})::int`,
        prev: sql<number>`count(*) filter (where ${users.createdAt} >= ${prevStart} and ${users.createdAt} < ${start})::int`,
      })
      .from(users),
    // Воронка по когорте зарегистрировавшихся в периоде
    db.execute<{ registered: number; with_book: number; engaged: number; ordered: number; paid: number }>(sql`
      select
        count(*)::int as registered,
        count(*) filter (where exists (select 1 from books b where b.user_id = u.id))::int as with_book,
        count(*) filter (where exists (
          select 1 from books b where b.user_id = u.id
          and (select count(*) from book_questions q where q.book_id = b.id and length(trim(q.answer)) > 0) >= 10))::int as engaged,
        count(*) filter (where exists (select 1 from orders o where o.user_id = u.id))::int as ordered,
        count(*) filter (where exists (select 1 from orders o where o.user_id = u.id and o.paid_at is not null and o.status <> 'cancelled'))::int as paid
      from users u where u.created_at >= ${start} and u.role = 'user'`),
    db
      .select({ plan: orders.plan, sum: sql<number>`sum(${orders.amount})::int`, n: sql<number>`count(*)::int` })
      .from(orders)
      .where(and(isNotNull(orders.paidAt), sql`${orders.paidAt} >= ${start}`, notCancelled))
      .groupBy(orders.plan),
    db
      .select()
      .from(orders)
      .where(and(isNotNull(orders.desiredDate), lte(orders.desiredDate, iso(localDay(14))), inArray(orders.status, ["pending_payment", "paid", "in_production"])))
      .orderBy(asc(orders.desiredDate))
      .limit(8),
    db
      .select()
      .from(crmTasks)
      .where(and(isNull(crmTasks.doneAt), lte(crmTasks.dueAt, localDay(1)), or(isNull(crmTasks.assigneeId), eq(crmTasks.assigneeId, admin.id))))
      .orderBy(asc(crmTasks.dueAt))
      .limit(8),
    db
      .select()
      .from(orders)
      .where(or(eq(orders.status, "paid"), and(eq(orders.status, "pending_payment"), isNotNull(orders.paymentClaimedAt))))
      .orderBy(asc(orders.createdAt))
      .limit(10),
    db
      .select({ e: orderEvents, number: orders.number, orderId: orders.id })
      .from(orderEvents)
      .innerJoin(orders, eq(orderEvents.orderId, orders.id))
      .where(gte(orderEvents.createdAt, localDay(-14)))
      .orderBy(desc(orderEvents.createdAt))
      .limit(10),
  ]);
  return { daily, cur, prev, newUsers, funnelRows, byPlan, deadlines, tasks, attention, events };
}
