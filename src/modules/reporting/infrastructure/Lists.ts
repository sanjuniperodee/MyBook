import "server-only";
import { and, asc, desc, eq, gte, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { crmCalls, crmDeals, crmTasks, orders, users } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";
import { visibleTo, type Viewer } from "./MyDay";

/**
 * Список задач: мои (и ничьи), все или одного сотрудника; открытые или выполненные; по типу и поиску по заголовку.
 * «Только свои» видят только свои и ничьи, что бы ни пришло в фильтре.
 */
export function taskList(viewer: Viewer, opts: { who: "mine" | "all" | (string & {}); done: boolean; kind?: string | null; q?: string | null }) {
  const w: SQL[] = [];
  const who = viewer.seesAll ? opts.who : "mine";
  if (who === "mine") w.push(or(eq(crmTasks.assigneeId, viewer.userId), isNull(crmTasks.assigneeId))!);
  else if (who !== "all") w.push(eq(crmTasks.assigneeId, who));
  w.push(opts.done ? isNotNull(crmTasks.doneAt) : isNull(crmTasks.doneAt));
  if (opts.kind && ["task", "call", "message", "meeting"].includes(opts.kind)) w.push(eq(crmTasks.kind, opts.kind as "task"));
  const q = opts.q?.trim().slice(0, 100);
  if (q) w.push(or(sql`${crmTasks.title} ilike ${`%${q}%`}`, sql`${crmDeals.title} ilike ${`%${q}%`}`, sql`${crmDeals.contactName} ilike ${`%${q}%`}`, sql`${users.name} ilike ${`%${q}%`}`)!);
  return executor()
    .select({ task: crmTasks, clientName: users.name, clientEmail: users.email, orderNumber: orders.number, dealTitle: crmDeals.title, dealContact: crmDeals.contactName, dealNumber: crmDeals.number })
    .from(crmTasks)
    .leftJoin(users, eq(crmTasks.clientId, users.id))
    .leftJoin(orders, eq(crmTasks.orderId, orders.id))
    .leftJoin(crmDeals, eq(crmTasks.dealId, crmDeals.id))
    .where(and(...w))
    .orderBy(opts.done ? desc(crmTasks.doneAt) : sql`${crmTasks.dueAt} asc nulls last`, asc(crmTasks.createdAt))
    .limit(300);
}

type CallFilter = "all" | "missed" | "in" | "out" | "mine";

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
