import "server-only";
import { and, eq, gt, gte, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { StaffContext } from "@/modules/access";
import { crmCalls, crmConversations, crmDeals, crmTasks, orders, reviews } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";

export interface CrmCounters {
  attention: number;
  tasks: number;
  chats: number;
  calls: number;
  deals: number;
  /** Новые отзывы клиентов, которые ещё никто не посмотрел. */
  reviews: number;
}

/** Счётчики для бейджей в меню CRM — с учётом прав и видимости сотрудника. */
export async function crmCounters(staff: StaffContext): Promise<CrmCounters> {
  const db = executor();
  const me = staff.userId;
  const mine = (col: AnyPgColumn) => (staff.scope === "all" ? undefined : or(isNull(col), eq(col, me)));
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const zero = Promise.resolve([{ n: 0 }]);
  const count = sql<number>`count(*)::int`;
  const [[attention], [tasks], [chats], [calls], [deals], [fresh]] = await Promise.all([
    staff.can("orders.view")
      ? db
          .select({ n: count })
          .from(orders)
          .where(or(eq(orders.status, "paid"), and(eq(orders.status, "pending_payment"), isNotNull(orders.paymentClaimedAt))))
      : zero,
    db
      .select({ n: count })
      .from(crmTasks)
      .where(and(isNull(crmTasks.doneAt), lte(crmTasks.dueAt, endOfToday), or(isNull(crmTasks.assigneeId), eq(crmTasks.assigneeId, me)))),
    staff.can("chats.view")
      ? db
          .select({ n: count })
          .from(crmConversations)
          .where(and(gt(crmConversations.unread, 0), mine(crmConversations.assigneeId)))
      : zero,
    staff.can("calls.view")
      ? db
          .select({ n: count })
          .from(crmCalls)
          .where(and(eq(crmCalls.status, "missed"), eq(crmCalls.direction, "in"), isNull(crmCalls.handledAt), gte(crmCalls.startedAt, sql`now() - interval '3 days'`), mine(crmCalls.staffId)))
      : zero,
    staff.can("deals.view")
      ? db
          .select({ n: count })
          .from(crmDeals)
          .where(and(eq(crmDeals.unsorted, true), mine(crmDeals.assigneeId)))
      : zero,
    staff.can("reviews.manage") ? db.select({ n: count }).from(reviews).where(eq(reviews.status, "new")) : zero,
  ]);
  return { attention: attention.n, tasks: tasks.n, chats: chats.n, calls: calls.n, deals: deals.n, reviews: fresh.n };
}
