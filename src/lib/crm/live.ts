import "server-only";
import { and, count, desc, eq, gte, isNull, or } from "drizzle-orm";
import { db } from "../db";
import { crmCalls, crmDeals, crmNotifications, users } from "../db/schema";
import { crmCounters, type CrmCounters } from "../crm";
import { can, contactView, type Staff } from "@/server/access";
import { formatPhone } from "./phone";

export interface LiveNotification {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  at: string;
}

export interface RingingCall {
  id: string;
  phone: string;
  name: string | null;
  clientId: string | null;
  dealId: string | null;
  direction: "in" | "out";
  mine: boolean;
  startedAt: string;
}

export interface LiveState {
  counters: CrmCounters;
  unread: number;
  notifications: LiveNotification[];
  ringing: RingingCall[];
}

/** Состояние для опроса раз в несколько секунд: бейджи, колокольчик, входящий звонок. */
export async function getLive(staff: Staff): Promise<LiveState> {
  const me = staff.user.id;
  const [counters, [{ n: unread }], list, ringingRows] = await Promise.all([
    crmCounters(staff),
    db
      .select({ n: count() })
      .from(crmNotifications)
      .where(and(eq(crmNotifications.userId, me), isNull(crmNotifications.readAt))),
    db.select().from(crmNotifications).where(eq(crmNotifications.userId, me)).orderBy(desc(crmNotifications.createdAt)).limit(12),
    can(staff, "calls.view")
      ? db
          .select({ call: crmCalls, clientName: users.name, dealName: crmDeals.contactName })
          .from(crmCalls)
          .leftJoin(users, eq(users.id, crmCalls.clientId))
          .leftJoin(crmDeals, eq(crmDeals.id, crmCalls.dealId))
          .where(
            and(
              eq(crmCalls.status, "ringing"),
              isNull(crmCalls.endedAt),
              gte(crmCalls.startedAt, new Date(Date.now() - 3 * 60_000)),
              // Звонок на мой внутренний номер или ещё не распределённый входящий.
              or(eq(crmCalls.staffId, me), and(isNull(crmCalls.staffId), eq(crmCalls.direction, "in"))),
            ),
          )
          .orderBy(desc(crmCalls.startedAt))
          .limit(3)
      : Promise.resolve([]),
  ]);
  return {
    counters,
    unread,
    notifications: list.map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, link: n.link, read: !!n.readAt, at: n.createdAt.toISOString() })),
    ringing: ringingRows.map(({ call, clientName, dealName }) => ({
      id: call.id,
      phone: contactView(staff, { phone: formatPhone(call.clientPhone) }).phone || "скрытый номер",
      name: clientName || dealName || null,
      clientId: call.clientId,
      dealId: call.dealId,
      direction: call.direction,
      mine: call.staffId === me,
      startedAt: call.startedAt.toISOString(),
    })),
  };
}
