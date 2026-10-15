import "server-only";
import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { crmReceipts } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";
import { deleteFile, getFile, putFile } from "@/shared/infrastructure/storage";
import { ReceiptError, receiptProblem, safeReceiptName, sniffReceipt } from "../domain";

export type ReceiptRow = typeof crmReceipts.$inferSelect;

/** Файл чека в хранилище, запись о котором ещё не сделана. */
export interface StagedReceipt {
  id: string;
  dealId: string;
  storageKey: string;
  fileName: string;
  mime: string;
  size: number;
}

/** Чеки об оплате по сделкам: метаданные в базе, файлы в хранилище (receipts/<сделка>/<id>.<тип>). */
export class DealReceipts {
  /** Сохранить чек целиком: файл и запись. */
  async add(input: { dealId: string; clientId: string | null; paymentId?: string | null; bytes: Buffer; fileName: string; amount: number; uploadedById: string }): Promise<ReceiptRow> {
    const staged = await this.stage({ dealId: input.dealId, bytes: input.bytes, fileName: input.fileName });
    try {
      return await this.record(staged, input);
    } catch (err) {
      await this.discard(staged);
      throw err;
    }
  }

  /** Проверить и положить файл чека в хранилище — до того, как записаны деньги. */
  async stage(input: { dealId: string; bytes: Buffer; fileName: string }): Promise<StagedReceipt> {
    const problem = receiptProblem(input.bytes);
    const type = sniffReceipt(input.bytes);
    if (problem || !type) throw new ReceiptError(problem ?? "type");
    const id = randomUUID();
    const storageKey = `receipts/${input.dealId}/${id}.${type.ext}`;
    await putFile(storageKey, input.bytes);
    return { id, dealId: input.dealId, storageKey, fileName: safeReceiptName(input.fileName, type.ext), mime: type.mime, size: input.bytes.length };
  }

  /** Запись о чеке, файл которого уже в хранилище. */
  async record(staged: StagedReceipt, input: { clientId: string | null; paymentId?: string | null; amount: number; uploadedById: string }): Promise<ReceiptRow> {
    const [row] = await executor()
      .insert(crmReceipts)
      .values({ id: staged.id, dealId: staged.dealId, paymentId: input.paymentId ?? null, clientId: input.clientId, storageKey: staged.storageKey, fileName: staged.fileName, mime: staged.mime, size: staged.size, amount: Math.max(0, Math.round(input.amount)), uploadedById: input.uploadedById })
      .returning();
    return row;
  }

  /** Убрать файл чека, запись о котором не состоялась. */
  async discard(staged: StagedReceipt) {
    await deleteFile(staged.storageKey).catch(() => {});
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
