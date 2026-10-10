import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { crmPayments, crmReceipts } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";

export type PaymentRow = typeof crmPayments.$inferSelect;

export const MAX_PAYMENT = 100_000_000;

export class PaymentError extends Error {
  constructor(public readonly code: "amount" | "date" | "refundTooBig") {
    super(code);
  }
}

/**
 * Платежи по сделкам, оформленным вручную. Деньги из этой таблицы вместе с оплаченными заказами образуют вьюху
 * revenue_events — по ней считаются обзор, аналитика, планы, LTV клиентов и каналы.
 */
export class DealPayments {
  async add(input: { dealId: string; clientId: string | null; amount: number; paidAt?: Date; note?: string; createdById: string }): Promise<PaymentRow> {
    const amount = Math.round(input.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_PAYMENT) throw new PaymentError("amount");
    const paidAt = input.paidAt ?? new Date();
    // Деньги из будущего в выручку не попадают: платёж принят не позже, чем «сейчас» (запас на часовые пояса).
    if (Number.isNaN(paidAt.getTime()) || paidAt.getTime() > Date.now() + 36 * 3600_000) throw new PaymentError("date");
    const [{ n }] = await executor().select({ n: sql<number>`count(*) filter (where ${crmPayments.kind} <> 'refund')::int` }).from(crmPayments).where(eq(crmPayments.dealId, input.dealId));
    const [row] = await executor()
      .insert(crmPayments)
      .values({ dealId: input.dealId, clientId: input.clientId, amount, kind: n === 0 ? "prepayment" : "payment", paidAt, note: (input.note ?? "").trim().slice(0, 300), createdById: input.createdById })
      .returning();
    return row;
  }

  /** Возврат денег клиенту: записывается платежом типа refund (в выручке — со знаком минус) и не может превышать принятое. */
  async refund(input: { dealId: string; clientId: string | null; amount: number; paidAt?: Date; note: string; createdById: string }): Promise<PaymentRow> {
    const amount = Math.round(input.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_PAYMENT) throw new PaymentError("amount");
    const paidAt = input.paidAt ?? new Date();
    if (Number.isNaN(paidAt.getTime()) || paidAt.getTime() > Date.now() + 36 * 3600_000) throw new PaymentError("date");
    if (amount > (await this.paidTotal(input.dealId))) throw new PaymentError("refundTooBig");
    const [row] = await executor().insert(crmPayments).values({ dealId: input.dealId, clientId: input.clientId, amount, kind: "refund", paidAt, note: input.note.trim().slice(0, 300), createdById: input.createdById }).returning();
    return row;
  }

  list(dealId: string) {
    return executor().select().from(crmPayments).where(eq(crmPayments.dealId, dealId)).orderBy(asc(crmPayments.paidAt), asc(crmPayments.createdAt));
  }

  async find(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const [row] = await executor().select().from(crmPayments).where(eq(crmPayments.id, id)).limit(1);
    return row ?? null;
  }

  /** Сколько денег принято по сделке: платежи минус возвраты. */
  async paidTotal(dealId: string) {
    const [r] = await executor().select({ s: sql<number>`coalesce(sum(case when ${crmPayments.kind} = 'refund' then -${crmPayments.amount} else ${crmPayments.amount} end), 0)::int` }).from(crmPayments).where(eq(crmPayments.dealId, dealId));
    return r.s;
  }

  /** Удалить ошибочный платёж. Чеки остаются у сделки (платёж у них обнуляется). */
  async remove(id: string) {
    await executor().update(crmReceipts).set({ paymentId: null }).where(eq(crmReceipts.paymentId, id));
    await executor().delete(crmPayments).where(eq(crmPayments.id, id));
  }
}
