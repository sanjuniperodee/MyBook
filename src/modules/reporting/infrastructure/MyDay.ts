import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { crmCalls, crmConversations, crmDeals, crmStages, crmTasks } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";
import { missedCalls, todayTasks, visibleTo, waitingChats, type Viewer } from "./conditions";

export { visibleTo, type Viewer } from "./conditions";

/** Сколько строк показывает каждый список «Моего дня»; числа на плитках — настоящие (counts), а не длина списка. */
export const MY_DAY_LIMITS = { waiting: 6, missed: 6 } as const;

/**
 * «Мой день»: задачи на сегодня (сколько и сколько просрочено), клиенты ждут ответа, пропущенные звонки, мои сделки,
 * неразобранное. Списки обрезаны (MY_DAY_LIMITS), числа считаются отдельно по тем же условиям, что бейджи меню и экраны
 * по ссылкам (tasks-d1).
 */
export async function myDay(viewer: Viewer, sections: { chats: boolean; calls: boolean; deals: boolean }) {
  const db = executor();
  const me = viewer.userId;
  const count = sql<number>`count(*)::int`;
  const none = Promise.resolve([]);
  const zero = Promise.resolve([{ n: 0 }]);
  const [[taskCount], waiting, [waitingCount], missed, [missedCount], [deals], [unsorted]] = await Promise.all([
    db
      .select({ n: count, overdue: sql<number>`count(*) filter (where ${crmTasks.dueAt} < now())::int` })
      .from(crmTasks)
      .where(todayTasks(me)),
    sections.chats ? db.select().from(crmConversations).where(waitingChats(viewer)).orderBy(asc(crmConversations.awaitingSince)).limit(MY_DAY_LIMITS.waiting) : none,
    sections.chats ? db.select({ n: count }).from(crmConversations).where(waitingChats(viewer)) : zero,
    sections.calls ? db.select().from(crmCalls).where(missedCalls(viewer)).orderBy(asc(crmCalls.startedAt)).limit(MY_DAY_LIMITS.missed) : none,
    sections.calls ? db.select({ n: count }).from(crmCalls).where(missedCalls(viewer)) : zero,
    sections.deals
      ? db
          .select({ n: count, sum: sql<number>`coalesce(sum(${crmDeals.amount}), 0)::int` })
          .from(crmDeals)
          .innerJoin(crmStages, eq(crmStages.id, crmDeals.stageId))
          .where(and(eq(crmStages.kind, "open"), eq(crmDeals.assigneeId, me)))
      : Promise.resolve([{ n: 0, sum: 0 }]),
    sections.deals
      ? db
          .select({ n: count })
          .from(crmDeals)
          .where(and(eq(crmDeals.unsorted, true), visibleTo(viewer, crmDeals.assigneeId)))
      : zero,
  ]);
  return { waiting, missed, deals, unsorted, counts: { tasks: taskCount.n, overdueTasks: taskCount.overdue, waiting: waitingCount.n, missed: missedCount.n } };
}
