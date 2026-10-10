import "server-only";
import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { crmReceipts } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";
import { getFile, putFile } from "@/shared/infrastructure/storage";
import { RECEIPT_MAX_BYTES, safeReceiptName, sniffReceipt } from "../domain";

export type ReceiptRow = typeof crmReceipts.$inferSelect;

export class ReceiptError extends Error {
  constructor(public readonly code: "empty" | "tooBig" | "type") {
    super(code);
  }
}

/** Чеки об оплате по сделкам: метаданные в базе, файлы в хранилище (receipts/<сделка>/<id>.<тип>). */
export class DealReceipts {
  async add(input: { dealId: string; clientId: string | null; paymentId?: string | null; bytes: Buffer; fileName: string; amount: number; uploadedById: string }): Promise<ReceiptRow> {
    if (!input.bytes.length) throw new ReceiptError("empty");
    if (input.bytes.length > RECEIPT_MAX_BYTES) throw new ReceiptError("tooBig");
    const type = sniffReceipt(input.bytes);
    if (!type) throw new ReceiptError("type");
    const id = randomUUID();
    const storageKey = `receipts/${input.dealId}/${id}.${type.ext}`;
    await putFile(storageKey, input.bytes);
    const [row] = await executor()
      .insert(crmReceipts)
      .values({ id, dealId: input.dealId, paymentId: input.paymentId ?? null, clientId: input.clientId, storageKey, fileName: safeReceiptName(input.fileName, type.ext), mime: type.mime, size: input.bytes.length, amount: Math.max(0, Math.round(input.amount)), uploadedById: input.uploadedById })
      .returning();
    return row;
  }

  list(dealId: string) {
    return executor().select().from(crmReceipts).where(eq(crmReceipts.dealId, dealId)).orderBy(asc(crmReceipts.createdAt));
  }

  async find(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const [row] = await executor().select().from(crmReceipts).where(eq(crmReceipts.id, id)).limit(1);
    return row ?? null;
  }

  read(row: Pick<ReceiptRow, "storageKey">) {
    return getFile(row.storageKey);
  }
}
