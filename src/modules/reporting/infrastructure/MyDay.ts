import "server-only";
import { and, asc, eq, gte, isNotNull, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { crmCalls, crmConversations, crmDeals, crmStages, crmTasks } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";

/** Кто смотрит отчёт: его id, видит ли он чужие записи и какие разделы ему открыты. */
export interface Viewer {
  userId: string;
  seesAll: boolean;
}

/** Видимость для роли «только свои»: запись без ответственного или моя. */
export function visibleTo(viewer: Viewer, column: AnyPgColumn): SQL | undefined {
  if (viewer.seesAll) return undefined;
  return or(eq(column, viewer.userId), isNull(column));
}

/** «Мой день»: задачи на сегодня, клиенты ждут ответа, пропущенные звонки, мои сделки, неразобранное. */
export async function myDay(viewer: Viewer, sections: { chats: boolean; calls: boolean; deals: boolean }) {
  const db = executor();
  const me = viewer.userId;
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);
  const none = Promise.resolve([]);
  const [tasks, waiting, missed, [deals], [unsorted]] = await Promise.all([
    db
      .select()
      .from(crmTasks)
      .where(and(isNull(crmTasks.doneAt), lte(crmTasks.dueAt, endOfDay), or(eq(crmTasks.assigneeId, me), isNull(crmTasks.assigneeId))))
      .orderBy(asc(crmTasks.dueAt))
      .limit(8),
    sections.chats
      ? db
          .select()
          .from(crmConversations)
          .where(and(isNotNull(crmConversations.awaitingSince), eq(crmConversations.status, "open"), visibleTo(viewer, crmConversations.assigneeId)))
          .orderBy(asc(crmConversations.awaitingSince))
          .limit(6)
      : none,
    sections.calls
      ? db
          .select()
          .from(crmCalls)
          .where(and(eq(crmCalls.status, "missed"), eq(crmCalls.direction, "in"), isNull(crmCalls.handledAt), gte(crmCalls.startedAt, sql`now() - interval '3 days'`), visibleTo(viewer, crmCalls.staffId)))
          .orderBy(asc(crmCalls.startedAt))
          .limit(6)
      : none,
    sections.deals
      ? db
          .select({ n: sql<number>`count(*)::int`, sum: sql<number>`coalesce(sum(${crmDeals.amount}), 0)::int` })
          .from(crmDeals)
          .innerJoin(crmStages, eq(crmStages.id, crmDeals.stageId))
          .where(and(eq(crmStages.kind, "open"), eq(crmDeals.assigneeId, me)))
      : Promise.resolve([{ n: 0, sum: 0 }]),
    sections.deals
      ? db
          .select({ n: sql<number>`count(*)::int` })
          .from(crmDeals)
          .where(and(eq(crmDeals.unsorted, true), visibleTo(viewer, crmDeals.assigneeId)))
      : Promise.resolve([{ n: 0 }]),
  ]);
  return { tasks, waiting, missed, deals, unsorted };
}
