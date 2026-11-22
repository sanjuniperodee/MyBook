import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, ilike, inArray, notInArray, or, sql, type SQL } from "drizzle-orm";
import { supportTickets } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";
import { SUPPORT_STATUSES, type SupportStatus } from "@/shared/domain/support";
import type { Ticket } from "../domain";
import type { TicketDraft, TicketFilter, TicketRepository } from "../application";

type Row = typeof supportTickets.$inferSelect;

const toTicket = (r: Row): Ticket => ({ ...r });

export class DrizzleTicketRepository implements TicketRepository {
  nextId() {
    return randomUUID();
  }

  async insert(id: string, draft: TicketDraft) {
    const [row] = await executor()
      .insert(supportTickets)
      .values({ id, ...draft })
      .returning();
    return toTicket(row);
  }

  async byId(id: string) {
    const [r] = await executor().select().from(supportTickets).where(eq(supportTickets.id, id)).limit(1);
    return r ? toTicket(r) : null;
  }

  async byNumber(n: number) {
    if (!Number.isSafeInteger(n) || n <= 0 || n > 2_147_483_647) return null;
    const [r] = await executor().select().from(supportTickets).where(eq(supportTickets.number, n)).limit(1);
    return r ? toTicket(r) : null;
  }

  async byNumbers(ns: number[]) {
    const ok = ns.filter((n) => Number.isSafeInteger(n) && n > 0 && n <= 2_147_483_647);
    if (!ok.length) return [];
    return (await executor().select().from(supportTickets).where(inArray(supportTickets.number, ok))).map(toTicket);
  }

  async update(id: string, patch: Partial<TicketDraft>) {
    if (!Object.keys(patch).length) return;
    await executor().update(supportTickets).set(patch).where(eq(supportTickets.id, id));
  }

  /** Список: открытые — сначала срочные, потом старые (кто дольше ждёт); закрытые и «все» — свежие сверху. */
  async list(filter: TicketFilter) {
    const where: SQL[] = [];
    const status = filter.status ?? "open";
    if (status === "open") where.push(notInArray(supportTickets.status, ["done", "rejected"]));
    else if (status !== "all") where.push(eq(supportTickets.status, status));
    const q = filter.q?.trim();
    if (q) {
      const num = Number(q.replace(/^№\s*/, ""));
      const digits = q.replace(/\D/g, "");
      const like = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
      const any = [ilike(supportTickets.description, like), ilike(supportTickets.summary, like), ilike(supportTickets.reporterName, like), ilike(supportTickets.place, like)];
      if (Number.isSafeInteger(num) && num > 0 && num <= 2_147_483_647) any.push(eq(supportTickets.number, num));
      if (digits.length >= 6) any.push(ilike(supportTickets.notifyPhone, `%${digits.slice(-10)}%`), ilike(supportTickets.clientPhone, `%${digits.slice(-10)}%`));
      where.push(or(...any)!);
    }
    const order = status === "open" ? [desc(sql`${supportTickets.urgency} = 'urgent'`), supportTickets.createdAt] : [desc(supportTickets.createdAt)];
    const rows = await executor()
      .select()
      .from(supportTickets)
      .where(where.length ? and(...where) : undefined)
      .orderBy(...order)
      .limit(Math.min(Math.max(filter.limit, 1), 500));
    return rows.map(toTicket);
  }

  async counts() {
    const rows = await executor()
      .select({ status: supportTickets.status, n: sql<number>`count(*)::int` })
      .from(supportTickets)
      .groupBy(supportTickets.status);
    const out = Object.fromEntries(SUPPORT_STATUSES.map((s) => [s, 0])) as Record<SupportStatus, number>;
    for (const r of rows) if (r.status in out) out[r.status] = r.n;
    return out;
  }
}
