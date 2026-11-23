import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import { orderPayments } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";
import type { OrderPaymentRecord, OrderPaymentRepository } from "../../domain";

type Row = typeof orderPayments.$inferSelect;

const toRecord = (r: Row): OrderPaymentRecord => ({
  id: r.id,
  orderId: r.orderId,
  kind: r.kind,
  amount: r.amount,
  method: r.method,
  externalRef: r.externalRef,
  payForm: r.payForm,
  paidAt: r.paidAt,
  note: r.note,
  receipt: r.receiptStorageKey ? { storageKey: r.receiptStorageKey, fileName: r.receiptFileName ?? "чек", mime: r.receiptMime ?? "application/octet-stream", size: r.receiptSize ?? 0, sha256: r.receiptSha256 } : null,
  requestKey: r.requestKey,
  createdById: r.createdById,
  reviewedById: r.reviewedById,
  reviewedAt: r.reviewedAt,
  voidedAt: r.voidedAt,
  voidedById: r.voidedById,
  voidReason: r.voidReason,
  createdAt: r.createdAt,
});

export class DrizzleOrderPaymentRepository implements OrderPaymentRepository {
  nextId() {
    return randomUUID();
  }

  async add(p: Parameters<OrderPaymentRepository["add"]>[0]) {
    const rows = await executor()
      .insert(orderPayments)
      .values({
        id: p.id,
        orderId: p.orderId,
        kind: p.kind,
        amount: p.amount,
        method: p.method,
        externalRef: p.externalRef,
        payForm: p.payForm ?? null,
        paidAt: p.paidAt,
        note: p.note,
        receiptStorageKey: p.receipt?.storageKey ?? null,
        receiptFileName: p.receipt?.fileName ?? null,
        receiptMime: p.receipt?.mime ?? null,
        receiptSize: p.receipt?.size ?? null,
        receiptSha256: p.receipt?.sha256 ?? null,
        requestKey: p.requestKey ?? null,
        createdById: p.createdById,
      })
      .onConflictDoNothing()
      .returning({ id: orderPayments.id });
    return rows.length > 0;
  }

  async list(orderId: string) {
    return (await executor().select().from(orderPayments).where(eq(orderPayments.orderId, orderId)).orderBy(asc(orderPayments.paidAt))).map(toRecord);
  }

  async find(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const [r] = await executor().select().from(orderPayments).where(eq(orderPayments.id, id)).limit(1);
    return r ? toRecord(r) : null;
  }

  async findByRequestKey(key: string) {
    const [r] = await executor().select().from(orderPayments).where(eq(orderPayments.requestKey, key)).limit(1);
    return r ? toRecord(r) : null;
  }

  async review(id: string, reviewerId: string, at: Date) {
    await executor().update(orderPayments).set({ reviewedById: reviewerId, reviewedAt: at }).where(eq(orderPayments.id, id));
  }

  async void(id: string, by: string | null, at: Date, reason: string) {
    await executor().update(orderPayments).set({ voidedById: by, voidedAt: at, voidReason: reason }).where(and(eq(orderPayments.id, id), isNull(orderPayments.voidedAt)));
  }

  async tagKaspiForms(forms: Record<string, string>) {
    const out: { orderId: string; form: string }[] = [];
    for (const [ref, form] of Object.entries(forms)) {
      const rows = await executor()
        .update(orderPayments)
        .set({ payForm: form })
        .where(and(eq(orderPayments.method, "kaspi"), eq(orderPayments.externalRef, ref), isNull(orderPayments.payForm)))
        .returning({ orderId: orderPayments.orderId });
      out.push(...rows.map((r) => ({ orderId: r.orderId, form })));
    }
    return out;
  }
}
