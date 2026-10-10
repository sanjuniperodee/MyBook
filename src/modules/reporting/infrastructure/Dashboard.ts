import "server-only";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { crmTasks, orderEvents, orders, users } from "@/shared/infrastructure/db/schema";
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

  const [dailyRes, curRes, prevRes, [newUsers], funnelRows, byPlanRes, deadlines, dealDeadlines, tasks, attention, events] = await Promise.all([
    // Выручка — единый журнал revenue_events: оплаченные заказы, платежи по ручным сделкам, успешные сделки без заказа.
    db.execute<{ d: string; sum: number; n: number }>(sql`
      select to_char((e.at at time zone ${tzSql})::date, 'YYYY-MM-DD') as d, sum(e.amount)::int as sum, count(distinct e.sale_id)::int as n
      from revenue_events e where e.at >= ${start} group by 1`),
    db.execute<{ sum: number; n: number }>(sql`
      select coalesce(sum(e.amount), 0)::int as sum, count(distinct e.sale_id)::int as n from revenue_events e where e.at >= ${start}`),
    db.execute<{ sum: number; n: number }>(sql`
      select coalesce(sum(e.amount), 0)::int as sum, count(distinct e.sale_id)::int as n from revenue_events e where e.at >= ${prevStart} and e.at < ${start}`),
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
        count(*) filter (where exists (select 1 from orders o where o.user_id = u.id) or exists (select 1 from revenue_events e where e.client_id = u.id))::int as ordered,
        count(*) filter (where exists (select 1 from revenue_events e where e.client_id = u.id))::int as paid
      from users u where u.created_at >= ${start} and u.role = 'user'`),
    db.execute<{ plan: string; sum: number; n: number }>(sql`
      select e.plan, sum(e.amount)::int as sum, count(distinct e.sale_id)::int as n from revenue_events e where e.at >= ${start} group by e.plan`),
    db
      .select()
      .from(orders)
      .where(and(isNotNull(orders.desiredDate), lte(orders.desiredDate, iso(localDay(14))), inArray(orders.status, ["pending_payment", "paid", "in_production"])))
      .orderBy(asc(orders.desiredDate))
      .limit(8),
    // Сроки ручных сделок (без заказа на сайте): дата в поле «Дата события», открытые, с деньгами и без.
    db.execute<{ id: string; number: number; title: string; contact_name: string; due: string; amount: number; paid: number }>(sql`
      select d.id, d.number, d.title, d.contact_name, d.custom_fields->>'event_date' as due, d.amount,
        coalesce((select sum(p.amount) from crm_payments p where p.deal_id = d.id), 0)::int as paid
      from crm_deals d join crm_stages s on s.id = d.stage_id
      where s.kind = 'open' and d.order_id is null and (d.custom_fields->>'event_date') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        and (d.custom_fields->>'event_date') <= ${iso(localDay(14))}
      order by due limit 8`),
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
  const zero = { sum: 0, n: 0 };
  return { daily: dailyRes.rows, cur: curRes.rows[0] ?? zero, prev: prevRes.rows[0] ?? zero, newUsers, funnelRows, byPlan: byPlanRes.rows, deadlines, dealDeadlines: dealDeadlines.rows, tasks, attention, events };
}
