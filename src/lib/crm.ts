import "server-only";
import { and, eq, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "./db";
import { crmTasks, orders, users } from "./db/schema";

/** Счётчики для бейджей в меню CRM. */
export async function crmCounters(adminId: string) {
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const [[attention], [tasks]] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(orders)
      .where(or(eq(orders.status, "paid"), and(eq(orders.status, "pending_payment"), isNotNull(orders.paymentClaimedAt)))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(crmTasks)
      .where(and(isNull(crmTasks.doneAt), lte(crmTasks.dueAt, endOfToday), or(isNull(crmTasks.assigneeId), eq(crmTasks.assigneeId, adminId)))),
  ]);
  return { attention: attention.n, tasks: tasks.n };
}

export async function listAdmins() {
  return db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.role, "admin")).orderBy(users.name);
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
