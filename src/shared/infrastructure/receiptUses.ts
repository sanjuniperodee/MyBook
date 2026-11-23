import "server-only";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { receiptReuseAllowed, type ReceiptCheck, type ReceiptTarget, type ReceiptUse } from "@/shared/domain/receipt";
import { executor } from "./database";

/** Хэш содержимого чека (SHA-256, hex): одинаковый файл — одинаковый хэш, имя файла не важно. */
export const receiptSha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

type Row = Record<string, unknown>;
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));

/**
 * Где уже приложен этот чек: к живым платежам заказов (отменённый как ошибочный — не в счёт: чек можно приложить к верной
 * оплате) и к платежам сделок. Чеки сделки без платежа (платёж удалили, просто приложили файл) — не в счёт.
 */
export async function receiptUses(sha256: string): Promise<ReceiptUse[]> {
  const r = await executor().execute<Row>(sql`
    select 'order' as source, o.number, op.amount, op.paid_at, op.created_at, o.user_id as client_id, o.id as order_id, null::uuid as deal_id
    from order_payments op join orders o on o.id = op.order_id
    where op.receipt_sha256 = ${sha256} and op.voided_at is null
    union all
    select 'deal', d.number, p.amount, p.paid_at, r.created_at, d.client_id, d.order_id, d.id
    from crm_receipts r join crm_payments p on p.id = r.payment_id join crm_deals d on d.id = r.deal_id
    where r.sha256 = ${sha256}
    order by created_at`);
  return r.rows.map((x) => ({
    source: x.source === "deal" ? "deal" : "order",
    number: Number(x.number),
    amount: Number(x.amount ?? 0),
    paidAt: x.paid_at ? new Date(x.paid_at instanceof Date ? x.paid_at.getTime() : String(x.paid_at)) : null,
    clientId: str(x.client_id),
    orderId: str(x.order_id),
    dealId: str(x.deal_id),
  }));
}

/** Чей заказ или сделка: клиент и связанный заказ — чтобы отличить пакет книг одного клиента от повтора чека. */
async function target(t: { orderId?: string | null; dealId?: string | null }): Promise<ReceiptTarget> {
  if (t.orderId) {
    const r = await executor().execute<Row>(sql`select user_id from orders where id = ${t.orderId}`);
    return { clientId: str(r.rows[0]?.user_id), orderId: t.orderId, dealId: null };
  }
  if (t.dealId) {
    const r = await executor().execute<Row>(sql`select client_id, order_id from crm_deals where id = ${t.dealId}`);
    return { clientId: str(r.rows[0]?.client_id), orderId: str(r.rows[0]?.order_id), dealId: t.dealId };
  }
  return { clientId: null, orderId: null, dealId: null };
}

/** Проверка чека перед записью платежа: хэш и первый платёж, к которому он уже приложен так, что второй раз нельзя. */
export const checkReceipt: ReceiptCheck = async (bytes, to) => {
  const sha256 = receiptSha256(bytes);
  const uses = await receiptUses(sha256);
  if (!uses.length) return { sha256, use: null };
  const where = await target(to);
  return { sha256, use: uses.find((u) => !receiptReuseAllowed(u, where)) ?? null };
};
