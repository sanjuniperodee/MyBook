import "server-only";
import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { orderPayments } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";
import type { OrderPaymentRecord, OrderPaymentRepository } from "../../domain";

type Row = typeof orderPayments.$inferSelect;

const toRecord = (r: Row): OrderPaymentRecord => ({
  id: r.id,
  orderId: r.orderId,
  amount: r.amount,
  method: r.method,
  externalRef: r.externalRef,
  paidAt: r.paidAt,
  note: r.note,
  receipt: r.receiptStorageKey ? { storageKey: r.receiptStorageKey, fileName: r.receiptFileName ?? "чек", mime: r.receiptMime ?? "application/octet-stream", size: r.receiptSize ?? 0 } : null,
  createdById: r.createdById,
  reviewedById: r.reviewedById,
  reviewedAt: r.reviewedAt,
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
        amount: p.amount,
        method: p.method,
        externalRef: p.externalRef,
        paidAt: p.paidAt,
        note: p.note,
        receiptStorageKey: p.receipt?.storageKey ?? null,
        receiptFileName: p.receipt?.fileName ?? null,
        receiptMime: p.receipt?.mime ?? null,
        receiptSize: p.receipt?.size ?? null,
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

  async review(id: string, reviewerId: string, at: Date) {
    await executor().update(orderPayments).set({ reviewedById: reviewerId, reviewedAt: at }).where(eq(orderPayments.id, id));
  }
}
