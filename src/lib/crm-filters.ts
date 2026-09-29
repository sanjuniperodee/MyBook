import "server-only";
import { and, eq, gte, ilike, isNull, lt, or, type SQL } from "drizzle-orm";
import { orders, orderStatuses } from "./db/schema";
import { plans } from "@/config/site";

export interface OrderFilters {
  status?: string;
  q?: string;
  plan?: string;
  assignee?: string; // "me" | "none" | uuid
  from?: string; // YYYY-MM-DD
  to?: string;
}

/** Условия выборки заказов — общие для таблицы и CSV-выгрузки. */
export function orderWhere(f: OrderFilters, adminId: string): SQL | undefined {
  const w: SQL[] = [];
  if (f.status && (orderStatuses as readonly string[]).includes(f.status)) w.push(eq(orders.status, f.status as never));
  if (f.plan && plans.some((p) => p.id === f.plan)) w.push(eq(orders.plan, f.plan));
  if (f.assignee === "me") w.push(eq(orders.assigneeId, adminId));
  else if (f.assignee === "none") w.push(isNull(orders.assigneeId));
  else if (f.assignee && /^[0-9a-f-]{36}$/i.test(f.assignee)) w.push(eq(orders.assigneeId, f.assignee));
  if (f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from)) w.push(gte(orders.createdAt, new Date(`${f.from}T00:00:00`)));
  if (f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to)) w.push(lt(orders.createdAt, new Date(new Date(`${f.to}T00:00:00`).getTime() + 86_400_000)));
  const q = f.q?.trim();
  if (q) {
    const s = `%${q}%`;
    const num = Number(q.replace(/\D/g, ""));
    w.push(or(ilike(orders.contactName, s), ilike(orders.contactEmail, s), ilike(orders.contactPhone, s), ilike(orders.city, s), ...(num && q.length < 8 ? [eq(orders.number, num)] : []))!);
  }
  return w.length ? and(...w) : undefined;
}
