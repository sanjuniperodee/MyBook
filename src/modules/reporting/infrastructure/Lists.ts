import "server-only";
import { and, asc, desc, eq, gte, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { crmCalls, crmDeals, crmTasks, orders, users } from "@/lib/db/schema";
import { executor } from "@/shared/infrastructure/database";
import { visibleTo, type Viewer } from "./MyDay";

/** Список задач: мои (и ничьи) или все, открытые или выполненные. */
export function taskList(viewer: Viewer, opts: { who: "mine" | "all"; done: boolean }) {
  const w: SQL[] = [];
  if (opts.who === "mine") w.push(or(eq(crmTasks.assigneeId, viewer.userId), isNull(crmTasks.assigneeId))!);
  w.push(opts.done ? isNotNull(crmTasks.doneAt) : isNull(crmTasks.doneAt));
  return executor()
    .select({ task: crmTasks, clientName: users.name, clientEmail: users.email, orderNumber: orders.number })
    .from(crmTasks)
    .leftJoin(users, eq(crmTasks.clientId, users.id))
    .leftJoin(orders, eq(crmTasks.orderId, orders.id))
    .where(and(...w))
    .orderBy(opts.done ? desc(crmTasks.doneAt) : sql`${crmTasks.dueAt} asc nulls last`, asc(crmTasks.createdAt))
    .limit(300);
}

export type CallFilter = "all" | "missed" | "in" | "out" | "mine";

/** Журнал звонков за N дней с фильтром и сводкой (видимость «только свои»). */
export async function callJournal(viewer: Viewer, f: CallFilter, days: number) {
  const db = executor();
  const since = gte(crmCalls.startedAt, sql`now() - make_interval(days => ${days})`);
  const scope = visibleTo(viewer, crmCalls.staffId);
  const w: SQL[] = [since];
  if (scope) w.push(scope);
  if (f === "missed") w.push(eq(crmCalls.status, "missed"), eq(crmCalls.direction, "in"), isNull(crmCalls.handledAt));
  if (f === "in") w.push(eq(crmCalls.direction, "in"));
  if (f === "out") w.push(eq(crmCalls.direction, "out"));
  if (f === "mine") w.push(eq(crmCalls.staffId, viewer.userId));
  const [rows, [stats]] = await Promise.all([
    db
      .select({ call: crmCalls, clientName: users.name, dealTitle: crmDeals.title, dealContact: crmDeals.contactName })
      .from(crmCalls)
      .leftJoin(users, eq(users.id, crmCalls.clientId))
      .leftJoin(crmDeals, eq(crmDeals.id, crmCalls.dealId))
      .where(and(...w))
      .orderBy(desc(crmCalls.startedAt))
      .limit(300),
    db
      .select({
        total: sql<number>`count(*)::int`,
        answered: sql<number>`count(*) filter (where ${crmCalls.status} = 'answered')::int`,
        missed: sql<number>`count(*) filter (where ${crmCalls.status} = 'missed' and ${crmCalls.direction} = 'in')::int`,
        talk: sql<number>`coalesce(sum(${crmCalls.durationSec}), 0)::int`,
      })
      .from(crmCalls)
      .where(and(since, scope)),
  ]);
  return { rows, stats };
}
