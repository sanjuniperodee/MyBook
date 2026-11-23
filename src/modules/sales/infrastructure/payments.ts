import "server-only";
import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { crmPayments, crmReceipts } from "@/shared/infrastructure/db/schema";
import { executor, inTransaction } from "@/shared/infrastructure/database";
import { MAX_PAYMENT, PaymentError } from "../domain";

export type PaymentRow = typeof crmPayments.$inferSelect;

/** Блокировка строки сделки до конца транзакции: платежи по одной сделке пишутся по очереди. */
const lockDeal = (dealId: string) => executor().execute(sql`select 1 from crm_deals where id = ${dealId} for no key update`);

/** Платёж с этим ключом отправки формы — под блокировкой сделки: двойное нажатие видит первую запись. */
async function sentWith(key: string | null | undefined) {
  if (!key) return null;
  const [row] = await executor().select().from(crmPayments).where(eq(crmPayments.requestKey, key)).limit(1);
  return row ?? null;
}

/**
 * Платежи по сделкам, оформленным вручную. Деньги из этой таблицы вместе с оплаченными заказами образуют вьюху
 * revenue_events — по ней считаются обзор, аналитика, планы, LTV клиентов и каналы.
 */
export class DealPayments {
  /**
   * Ручной платёж. requestKey — ключ отправки формы: повтор той же отправки возвращает уже записанный платёж (repeated),
   * второй раз денег нет.
   */
  async add(input: { dealId: string; clientId: string | null; amount: number; paidAt?: Date; note?: string; createdById: string; invoiceId?: string | null; payForm?: string | null; requestKey?: string | null }): Promise<PaymentRow & { repeated: boolean }> {
    const amount = Math.round(input.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_PAYMENT) throw new PaymentError("amount");
    const paidAt = input.paidAt ?? new Date();
    // Деньги из будущего в выручку не попадают: платёж принят не позже, чем «сейчас» (запас на часовые пояса).
    if (Number.isNaN(paidAt.getTime()) || paidAt.getTime() > Date.now() + 36 * 3600_000) throw new PaymentError("date");
    // Первый платёж по сделке — «предоплата»: считаем под блокировкой сделки, иначе два одновременных платежа оба станут ею (B6).
    return inTransaction(async () => {
      await lockDeal(input.dealId);
      const twin = await sentWith(input.requestKey);
      if (twin) return { ...twin, repeated: true };
      const [{ n }] = await executor().select({ n: sql<number>`count(*) filter (where ${crmPayments.kind} <> 'refund')::int` }).from(crmPayments).where(eq(crmPayments.dealId, input.dealId));
      const [row] = await executor()
        .insert(crmPayments)
        .values({ dealId: input.dealId, clientId: input.clientId, amount, kind: n === 0 ? "prepayment" : "payment", paidAt, note: (input.note ?? "").trim().slice(0, 300), createdById: input.createdById, invoiceId: input.invoiceId ?? null, payForm: input.payForm ?? null, requestKey: input.requestKey ?? null })
        .returning();
      return { ...row, repeated: false };
    });
  }

  /**
   * Онлайн-платёж по счёту из чата (Kaspi, CloudPayments): без чека — подтверждает платёжная система, и без сотрудника.
   * Идемпотентно по операции: та же операция повторно — null (деньги уже записаны).
   */
  async addOnline(input: { dealId: string; clientId: string | null; amount: number; paidAt: Date; method: "kaspi" | "cloudpayments"; externalRef: string; invoiceId: string; note: string }): Promise<PaymentRow | null> {
    const amount = Math.round(input.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_PAYMENT) throw new PaymentError("amount");
    return inTransaction(async () => {
      await lockDeal(input.dealId);
      const [{ n }] = await executor().select({ n: sql<number>`count(*) filter (where ${crmPayments.kind} <> 'refund')::int` }).from(crmPayments).where(eq(crmPayments.dealId, input.dealId));
      const [row] = await executor()
        .insert(crmPayments)
        .values({ dealId: input.dealId, clientId: input.clientId, amount, kind: n === 0 ? "prepayment" : "payment", paidAt: input.paidAt, note: input.note.slice(0, 300), method: input.method, externalRef: input.externalRef, invoiceId: input.invoiceId, createdById: null })
        .onConflictDoNothing()
        .returning();
      return row ?? null;
    });
  }

  /** Возврат денег клиенту: записывается платежом типа refund (в выручке — со знаком минус) и не может превышать принятое. */
  async refund(input: { dealId: string; clientId: string | null; amount: number; paidAt?: Date; note: string; createdById: string; payForm?: string | null; requestKey?: string | null }): Promise<PaymentRow & { repeated: boolean }> {
    const amount = Math.round(input.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_PAYMENT) throw new PaymentError("amount");
    const paidAt = input.paidAt ?? new Date();
    if (Number.isNaN(paidAt.getTime()) || paidAt.getTime() > Date.now() + 36 * 3600_000) throw new PaymentError("date");
    // Сверка с принятым — под блокировкой сделки: два одновременных возврата не превысят принятое (B6).
    return inTransaction(async () => {
      await lockDeal(input.dealId);
      const twin = await sentWith(input.requestKey);
      if (twin) return { ...twin, repeated: true };
      if (amount > (await this.paidTotal(input.dealId))) throw new PaymentError("refundTooBig");
      const [row] = await executor().insert(crmPayments).values({ dealId: input.dealId, clientId: input.clientId, amount, kind: "refund", paidAt, note: input.note.trim().slice(0, 300), createdById: input.createdById, payForm: input.payForm ?? null, requestKey: input.requestKey ?? null }).returning();
      return { ...row, repeated: false };
    });
  }

  /** Платёж, записанный отправкой формы с этим ключом (повтор после сбоя): до проверки чека — иначе «чек уже приложен». */
  findByRequestKey(key: string) {
    return sentWith(key);
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

  /**
   * Сделку привязали к клиенту (клиент завёлся или нашёлся оплатой счёта): её платежи и чеки без клиента — к нему
   * (а при смене клиента сделки — и записанные на прежнего). Выручка (revenue_events) считает каждый платёж один раз
   * по его строке, поэтому LTV клиента растёт без задвоения.
   */
  async assignClient(dealId: string, clientId: string, fromClientId: string | null = null) {
    const owner = (t: typeof crmPayments | typeof crmReceipts) => (fromClientId ? or(isNull(t.clientId), eq(t.clientId, fromClientId)) : isNull(t.clientId));
    await executor().update(crmPayments).set({ clientId }).where(and(eq(crmPayments.dealId, dealId), owner(crmPayments)));
    await executor().update(crmReceipts).set({ clientId }).where(and(eq(crmReceipts.dealId, dealId), owner(crmReceipts)));
  }

  /**
   * Руководитель сверил ручной платёж с поступлением на счёт («Финансы» → «Проверить»). Одним условным обновлением:
   * онлайн-платёж (его подтвердила платёжная система) и уже проверенный не трогаются — тогда null.
   */
  async review(id: string, reviewerId: string, at = new Date()): Promise<PaymentRow | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const [row] = await executor()
      .update(crmPayments)
      .set({ reviewedById: reviewerId, reviewedAt: at })
      .where(and(eq(crmPayments.id, id), eq(crmPayments.method, "manual"), isNull(crmPayments.reviewedAt)))
      .returning();
    return row ?? null;
  }

  /**
   * Формы оплаты онлайн-платежей Kaspi по операциям (id операции → форма) — из истории кассы: только платежам без формы.
   * Отмеченные платежи — с их сделками (форму сделке ставит DealsService.notePayForm).
   */
  async tagKaspiForms(forms: Record<string, string>) {
    const out: { dealId: string; form: string }[] = [];
    for (const [ref, form] of Object.entries(forms)) {
      const rows = await executor()
        .update(crmPayments)
        .set({ payForm: form })
        .where(and(eq(crmPayments.method, "kaspi"), eq(crmPayments.externalRef, ref), isNull(crmPayments.payForm)))
        .returning({ dealId: crmPayments.dealId });
      out.push(...rows.map((r) => ({ dealId: r.dealId, form })));
    }
    return out;
  }

  /** Удалить ошибочный платёж. Чеки остаются у сделки (платёж у них обнуляется). */
  async remove(id: string) {
    await executor().update(crmReceipts).set({ paymentId: null }).where(eq(crmReceipts.paymentId, id));
    await executor().delete(crmPayments).where(eq(crmPayments.id, id));
  }
}
