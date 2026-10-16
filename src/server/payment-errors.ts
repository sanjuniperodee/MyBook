import { PaymentError } from "@/modules/sales";
import { RECEIPT_MAX_BYTES, type ReceiptProblem } from "@/modules/sales/domain";
import { HttpError } from "@/server/api";

/** Файл не годится в чек — отказ 400 с текстом для менеджера (словарь admin). */
export function receiptProblemError(problem: ReceiptProblem): HttpError {
  if (problem === "tooBig") return new HttpError(400, "receiptTooBig", RECEIPT_MAX_BYTES / 1024 / 1024);
  return new HttpError(400, problem === "empty" ? "receiptEmpty" : "receiptType");
}

/** Платёж не принят (сумма, дата, возврат больше принятого) — отказ 400 с текстом для менеджера. */
export function paymentProblemError(code: PaymentError["code"]): HttpError {
  if (code === "amount") return new HttpError(400, "amountInvalid");
  return new HttpError(400, code === "refundTooBig" ? "refundTooBig" : "paymentDateFuture");
}
