import { RECEIPT_MAX_BYTES, type ReceiptProblem } from "../domain/receipt";

/** Что сказать менеджеру, если файл не годится в чек. */
export const receiptProblemText: Record<ReceiptProblem, string> = {
  empty: "Файл пустой",
  tooBig: `Файл больше ${RECEIPT_MAX_BYTES / 1024 / 1024} МБ`,
  type: "Нужен файл JPG, PNG, WEBP или PDF",
};
