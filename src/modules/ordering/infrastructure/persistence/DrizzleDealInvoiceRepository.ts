import "server-only";
import { readGifts } from "@/shared/domain/agreementGifts";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { dealInvoices } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";
import { DealInvoice, type AccessStatus, type DealInvoiceMethod, type DealInvoiceRepository } from "../../domain";

type Row = typeof dealInvoices.$inferSelect;

/** Номер advisory-блокировки выпуска счёта по сделке (второй ключ — хэш сделки). */
const ISSUE_LOCK = 7_310_454;

const toDomain = (r: Row) =>
  DealInvoice.restore(r.id, {
    number: r.number,
    token: r.token,
    dealId: r.dealId,
    conversationId: r.conversationId,
    phone: r.phone,
    clientName: r.clientName,
    locale: r.locale,
    channel: r.channel,
    plan: r.plan,
    agreedTotal: r.agreedTotal,
    booksCount: r.booksCount,
    gifts: readGifts(r.gifts),
    amount: r.amount,
    purpose: r.purpose,
    status: r.status,
    paidMethod: r.paidMethod as DealInvoiceMethod | null,
    paidRef: r.paidRef,
    paidAt: r.paidAt,
    claimedAt: r.claimedAt,
    closedReason: r.closedReason,
    expiresAt: r.expiresAt,
    issuedById: r.issuedById,
    accessStatus: r.accessStatus as AccessStatus,
    accessUserId: r.accessUserId,
    accessMessageId: r.accessMessageId,
    accessAttemptedAt: r.accessAttemptedAt,
    issueKey: r.issueKey,
    createdAt: r.createdAt,
  });

const toRow = (i: DealInvoice) => {
  const { id: _id, createdAt: _c, ...s } = i.snapshot();
  void _id;
  void _c;
  return s;
};

export class DrizzleDealInvoiceRepository implements DealInvoiceRepository {
  async nextIdentity() {
    const { rows } = await executor().execute<{ n: number }>(sql`select nextval(pg_get_serial_sequence('deal_invoices', 'number'))::int as n`);
    return { id: randomUUID(), number: rows[0].n };
  }

  private async one(where: ReturnType<typeof eq>, lock = false) {
    const q = executor().select().from(dealInvoices).where(where).limit(1);
    const [r] = lock ? await q.for("update") : await q;
    return r ? toDomain(r) : null;
  }

  findById(id: string) {
    return /^[0-9a-f-]{36}$/i.test(id) ? this.one(eq(dealInvoices.id, id)) : Promise.resolve(null);
  }

  findByToken(token: string) {
    return /^[A-Za-z0-9_-]{30,60}$/.test(token) ? this.one(eq(dealInvoices.token, token)) : Promise.resolve(null);
  }

  findByIssueKey(key: string) {
    return key ? this.one(eq(dealInvoices.issueKey, key)) : Promise.resolve(null);
  }

  findByNumber(number: number) {
    return Number.isInteger(number) && number > 0 ? this.one(eq(dealInvoices.number, number)) : Promise.resolve(null);
  }

  lockById(id: string) {
    return /^[0-9a-f-]{36}$/i.test(id) ? this.one(eq(dealInvoices.id, id), true) : Promise.resolve(null);
  }

  async lockDeal(dealId: string) {
    await executor().execute(sql`select pg_advisory_xact_lock(${ISSUE_LOCK}, hashtext(${dealId}))`);
  }

  async openFor(dealId: string) {
    const [r] = await executor()
      .select()
      .from(dealInvoices)
      .where(and(eq(dealInvoices.dealId, dealId), eq(dealInvoices.status, "pending_payment")))
      .limit(1);
    return r ? toDomain(r) : null;
  }

  async listFor(dealId: string) {
    return (await executor().select().from(dealInvoices).where(eq(dealInvoices.dealId, dealId)).orderBy(desc(dealInvoices.createdAt))).map(toDomain);
  }

  async overdue(now: Date, limit: number) {
    return (await executor().select().from(dealInvoices).where(and(eq(dealInvoices.status, "pending_payment"), lt(dealInvoices.expiresAt, now))).orderBy(asc(dealInvoices.expiresAt)).limit(limit)).map(toDomain);
  }

  async accessDue(limit: number) {
    return (await executor().select().from(dealInvoices).where(and(eq(dealInvoices.status, "paid"), inArray(dealInvoices.accessStatus, ["due"]))).orderBy(asc(dealInvoices.paidAt)).limit(limit)).map(toDomain);
  }

  async accessSentSince(since: Date, limit: number) {
    return (await executor().select().from(dealInvoices).where(and(eq(dealInvoices.status, "paid"), eq(dealInvoices.accessStatus, "sent"), gte(dealInvoices.updatedAt, since))).orderBy(desc(dealInvoices.updatedAt)).limit(limit)).map(toDomain);
  }

  async add(invoice: DealInvoice) {
    await executor().insert(dealInvoices).values({ id: invoice.id, ...toRow(invoice), createdAt: invoice.snapshot().createdAt });
  }

  async save(invoice: DealInvoice) {
    await executor().update(dealInvoices).set({ ...toRow(invoice), updatedAt: new Date() }).where(eq(dealInvoices.id, invoice.id));
  }
}
