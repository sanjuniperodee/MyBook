import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, type SQL } from "drizzle-orm";
import { paymentInvoices } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";
import { PaymentInvoice, type PaymentInvoiceRepository, type PaymentTarget } from "../../domain";

type Row = typeof paymentInvoices.$inferSelect;

const UUID = /^[0-9a-f-]{36}$/i;

const toDomain = (r: Row) =>
  PaymentInvoice.restore(r.id, {
    provider: r.provider,
    target: { kind: r.targetKind, id: r.targetId },
    method: r.method,
    externalId: r.externalId,
    phone: r.phone,
    amount: r.amount,
    status: r.status,
    providerStatus: r.providerStatus,
    checkoutUrl: r.checkoutUrl,
    qrToken: r.qrToken,
    expiresAt: r.expiresAt,
    paidAt: r.paidAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  });

function toRow(invoice: PaymentInvoice) {
  const { id, target, ...rest } = invoice.snapshot();
  return { ...rest, id, targetKind: target.kind, targetId: target.id };
}

export class DrizzlePaymentInvoiceRepository implements PaymentInvoiceRepository {
  nextId() {
    return randomUUID();
  }

  private async one(where: SQL | undefined, lock = false) {
    const q = executor().select().from(paymentInvoices).where(where).limit(1);
    const [row] = lock ? await q.for("update") : await q;
    return row ? toDomain(row) : null;
  }

  findById(id: string) {
    return UUID.test(id) ? this.one(eq(paymentInvoices.id, id)) : Promise.resolve(null);
  }

  lockById(id: string) {
    return UUID.test(id) ? this.one(eq(paymentInvoices.id, id), true) : Promise.resolve(null);
  }

  findByExternalId(provider: "kaspi", externalId: string) {
    return this.one(and(eq(paymentInvoices.provider, provider), eq(paymentInvoices.externalId, externalId)));
  }

  async latestFor(target: PaymentTarget) {
    const [row] = await executor()
      .select()
      .from(paymentInvoices)
      .where(and(eq(paymentInvoices.targetKind, target.kind), eq(paymentInvoices.targetId, target.id)))
      .orderBy(desc(paymentInvoices.createdAt))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async toReconcile(since: Date, limit: number) {
    const rows = await executor()
      .select()
      .from(paymentInvoices)
      .where(and(inArray(paymentInvoices.status, ["pending", "expired"]), gte(paymentInvoices.createdAt, since)))
      .orderBy(desc(paymentInvoices.createdAt))
      .limit(limit);
    return rows.map(toDomain);
  }

  async add(invoice: PaymentInvoice) {
    await executor().insert(paymentInvoices).values(toRow(invoice));
  }

  async save(invoice: PaymentInvoice) {
    const { id, ...row } = toRow(invoice);
    await executor().update(paymentInvoices).set(row).where(eq(paymentInvoices.id, id));
  }
}
