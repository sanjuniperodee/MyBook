import "server-only";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type { ReceiptCheck, ReceiptUse } from "@/shared/domain/receipt";
import { executor } from "./database";

/** Хэш содержимого чека (SHA-256, hex): одинаковый файл — одинаковый хэш, имя файла не важно. */
export const receiptSha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/**
 * Где уже приложен этот чек: к живому платежу заказа (отменённый как ошибочный — не в счёт: чек можно приложить к верной
 * оплате) или к платежу сделки. Чеки сделки без платежа (платёж удалили, просто приложили файл) — не в счёт.
 */
export async function receiptUse(sha256: string): Promise<ReceiptUse | null> {
  const r = await executor().execute<Record<string, unknown>>(sql`
    select * from (
      select 'order' as source, o.number, op.amount, op.paid_at, op.created_at
      from order_payments op join orders o on o.id = op.order_id
      where op.receipt_sha256 = ${sha256} and op.voided_at is null
      union all
      select 'deal', d.number, p.amount, p.paid_at, r.created_at
      from crm_receipts r join crm_payments p on p.id = r.payment_id join crm_deals d on d.id = r.deal_id
      where r.sha256 = ${sha256}
    ) x
    order by created_at
    limit 1`);
  const row = r.rows[0];
  if (!row) return null;
  return { source: row.source === "deal" ? "deal" : "order", number: Number(row.number), amount: Number(row.amount ?? 0), paidAt: row.paid_at ? new Date(String(row.paid_at instanceof Date ? row.paid_at.toISOString() : row.paid_at)) : null };
}

/** Проверка чека перед записью платежа: хэш и где он уже приложен. */
export const checkReceipt: ReceiptCheck = async (bytes) => {
  const sha256 = receiptSha256(bytes);
  return { sha256, use: await receiptUse(sha256) };
};
