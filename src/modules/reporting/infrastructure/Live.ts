import "server-only";
import { and, count, desc, eq, gte, isNull, ne, or } from "drizzle-orm";
import { executor } from "@/shared/infrastructure/database";
import { crmCalls, crmDeals, crmNotifications, users } from "@/shared/infrastructure/db/schema";
import { crmCounters, type CrmCounters } from "./Counters";
import type { StaffView } from "./Staff";
import { formatPhone } from "@/shared/domain/phone";

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
  /** Входящий в WhatsApp: на него отвечают прямо в CRM (кнопки «Ответить» / «Отклонить»). */
  whatsapp: boolean;
  startedAt: string;
}

export interface LiveState {
  counters: CrmCounters;
  unread: number;
  notifications: LiveNotification[];
  ringing: RingingCall[];
}

/** Состояние для опроса раз в несколько секунд: бейджи, колокольчик, входящий звонок. */
export async function getLive(staff: StaffView): Promise<LiveState> {
  const me = staff.userId;
  const db = executor();
  const [counters, [{ n: unread }], list, ringingRows] = await Promise.all([
    crmCounters(staff),
    db
      .select({ n: count() })
      .from(crmNotifications)
      .where(and(eq(crmNotifications.userId, me), isNull(crmNotifications.readAt))),
    db.select().from(crmNotifications).where(eq(crmNotifications.userId, me)).orderBy(desc(crmNotifications.createdAt)).limit(12),
    staff.can("calls.view")
      ? db
          .select({ call: crmCalls, clientName: users.name, dealName: crmDeals.contactName })
          .from(crmCalls)
          .leftJoin(users, eq(users.id, crmCalls.clientId))
          .leftJoin(crmDeals, eq(crmDeals.id, crmCalls.dealId))
          .where(
            and(
              eq(crmCalls.status, "ringing"),
              isNull(crmCalls.endedAt),
              or(
                and(ne(crmCalls.provider, "whatsapp"), gte(crmCalls.startedAt, new Date(Date.now() - 3 * 60_000))),
                // WhatsApp: только входящий, пока он звонит (около минуты). Исходящий идёт в панели звонка у того, кто набрал.
                and(eq(crmCalls.provider, "whatsapp"), eq(crmCalls.direction, "in"), gte(crmCalls.startedAt, new Date(Date.now() - 75_000))),
              ),
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
      phone: staff.contacts({ phone: formatPhone(call.clientPhone) }).phone || "скрытый номер",
      name: clientName || dealName || null,
      clientId: call.clientId,
      dealId: call.dealId,
      direction: call.direction,
      mine: call.staffId === me,
      whatsapp: call.provider === "whatsapp",
      startedAt: call.startedAt.toISOString(),
    })),
  };
}
