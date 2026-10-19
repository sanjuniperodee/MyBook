import "server-only";
import { and, eq, gt, isNotNull, ne, or, sql } from "drizzle-orm";
import { crmCalls, crmConversations, crmDeals, crmTasks, orders, reviews } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";
import { missedCalls, todayTasks, visibleTo } from "./conditions";
import type { StaffView } from "./Staff";

export interface CrmCounters {
  attention: number;
  tasks: number;
  chats: number;
  calls: number;
  deals: number;
  /** Новые отзывы клиентов, которые ещё никто не посмотрел. */
  reviews: number;
  /** «Финансы» → «Проверить»: ручные подтверждения денег, которые руководитель ещё не сверил (только для team.manage). */
  finance: number;
}

/** Счётчики для бейджей в меню CRM — с учётом прав и видимости сотрудника. Задачи и звонки — по условиям «Моего дня». */
export async function crmCounters(staff: Pick<StaffView, "userId" | "scope" | "can">): Promise<CrmCounters> {
  const db = executor();
  const viewer = { userId: staff.userId, seesAll: staff.scope === "all" };
  const zero = Promise.resolve([{ n: 0 }]);
  const count = sql<number>`count(*)::int`;
  const [[attention], [tasks], [chats], [calls], [deals], [fresh], [unreviewed]] = await Promise.all([
    staff.can("orders.view")
      ? db
          .select({ n: count })
          .from(orders)
          .where(or(and(eq(orders.status, "paid"), ne(orders.plan, "digital")), and(eq(orders.status, "pending_payment"), isNotNull(orders.paymentClaimedAt))))
      : zero,
    db.select({ n: count }).from(crmTasks).where(todayTasks(staff.userId)),
    staff.can("chats.view")
      ? db
          .select({ n: count })
          .from(crmConversations)
          .where(and(gt(crmConversations.unread, 0), visibleTo(viewer, crmConversations.assigneeId)))
      : zero,
    staff.can("calls.view") ? db.select({ n: count }).from(crmCalls).where(missedCalls(viewer)) : zero,
    staff.can("deals.view")
      ? db
          .select({ n: count })
          .from(crmDeals)
          .where(and(eq(crmDeals.unsorted, true), visibleTo(viewer, crmDeals.assigneeId)))
      : zero,
    staff.can("reviews.manage") ? db.select({ n: count }).from(reviews).where(eq(reviews.status, "new")) : zero,
    staff.can("team.manage")
      ? db
          .execute<{ n: number }>(
            sql`select ((select count(*) from crm_payments where method = 'manual' and kind <> 'refund' and reviewed_at is null) + (select count(*) from order_payments where method = 'manual' and reviewed_at is null))::int as n`,
          )
          .then((r) => r.rows)
      : zero,
  ]);
  return { attention: attention.n, tasks: tasks.n, chats: chats.n, calls: calls.n, deals: deals.n, reviews: fresh.n, finance: unreviewed?.n ?? 0 };
}
