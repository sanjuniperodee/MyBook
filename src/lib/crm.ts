import "server-only";
import { and, eq, gt, gte, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "./db";
import { crmCalls, crmConversations, crmDeals, crmStages, crmTasks, orders, users } from "./db/schema";
import { can, type Staff } from "@/server/access";

export interface CrmCounters {
  attention: number;
  tasks: number;
  chats: number;
  calls: number;
  deals: number;
}

/** Счётчики для бейджей в меню CRM — с учётом прав и видимости сотрудника. */
export async function crmCounters(staff: Staff): Promise<CrmCounters> {
  const me = staff.user.id;
  const mine = (col: AnyPgColumn) => (staff.scope === "all" ? undefined : or(isNull(col), eq(col, me)));
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const zero = Promise.resolve([{ n: 0 }]);
  const count = sql<number>`count(*)::int`;
  const [[attention], [tasks], [chats], [calls], [deals]] = await Promise.all([
    can(staff, "orders.view")
      ? db
          .select({ n: count })
          .from(orders)
          .where(or(eq(orders.status, "paid"), and(eq(orders.status, "pending_payment"), isNotNull(orders.paymentClaimedAt))))
      : zero,
    db
      .select({ n: count })
      .from(crmTasks)
      .where(and(isNull(crmTasks.doneAt), lte(crmTasks.dueAt, endOfToday), or(isNull(crmTasks.assigneeId), eq(crmTasks.assigneeId, me)))),
    can(staff, "chats.view")
      ? db
          .select({ n: count })
          .from(crmConversations)
          .where(and(gt(crmConversations.unread, 0), mine(crmConversations.assigneeId)))
      : zero,
    can(staff, "calls.view")
      ? db
          .select({ n: count })
          .from(crmCalls)
          .where(and(eq(crmCalls.status, "missed"), eq(crmCalls.direction, "in"), isNull(crmCalls.handledAt), gte(crmCalls.startedAt, sql`now() - interval '3 days'`), mine(crmCalls.staffId)))
      : zero,
    can(staff, "deals.view")
      ? db
          .select({ n: count })
          .from(crmDeals)
          .where(and(eq(crmDeals.unsorted, true), mine(crmDeals.assigneeId)))
      : zero,
  ]);
  return { attention: attention.n, tasks: tasks.n, chats: chats.n, calls: calls.n, deals: deals.n };
}

/** Все сотрудники, включая отключённых (их имена нужны в истории). Для выпадающих списков — staffOptions(). */
export async function listAdmins() {
  return db.select({ id: users.id, name: users.name, email: users.email, disabled: users.staffDisabled }).from(users).where(eq(users.role, "admin")).orderBy(users.name);
}

/** Варианты «ответственного»: только активные сотрудники. */
export function staffOptions(admins: { id: string; name: string; email: string; disabled: boolean }[]) {
  return admins.filter((a) => !a.disabled).map((a) => ({ id: a.id, label: adminLabel(a) }));
}

export function adminLabel(a: { name: string; email: string } | null | undefined) {
  if (!a) return "—";
  return a.name && a.name !== "Администратор" ? a.name : a.email.split("@")[0];
}

/** Сегменты клиентов CRM. */
export const clientSegments = {
  all: "Все",
  customers: "Покупатели",
  writing: "Пишут книгу",
  stalled: "Забросили",
  unpaid: "Не оплатили",
  vip: "VIP",
} as const;
export type ClientSegment = keyof typeof clientSegments;

export function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]) {
  // BOM + точка с запятой — Excel с русской локалью открывает такой файл корректно.
  return "﻿" + [header, ...rows].map((r) => r.map(csvEscape).join(";")).join("\r\n") + "\r\n";
}
