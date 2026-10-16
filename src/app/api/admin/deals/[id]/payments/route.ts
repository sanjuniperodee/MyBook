import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { api, apiStaff, HttpError } from "@/server/api";
import { can, canWork } from "@/server/access";
import { container } from "@/server/container";
import { PaymentError, ReceiptError } from "@/modules/sales";
import { RECEIPT_MAX_BYTES, receiptProblem } from "@/modules/sales/domain";
import { paymentProblemError, receiptProblemError } from "@/server/payment-errors";
import { fromZonedTime } from "@/shared/domain/time";
import { z } from "zod";
import { formText, idParams } from "@/server/input";

export const maxDuration = 60;

/** Поля формы платежа, кроме файла чека: тексты; вид — платёж или возврат. Подмена (файл вместо текста) → 400. */
const paymentForm = z.object({ kind: z.enum(["payment", "refund", ""]).default(""), note: formText, amount: formText, paidAt: formText });

/**
 * Принять платёж (или оформить возврат: kind=refund, причина в note) по сделке: multipart — amount (₸), paidAt (YYYY-MM-DD, по умолчанию сегодня), note и file — чек
 * (скриншот, фото или PDF до 12 МБ). Роут разбирает форму и проверяет права; деньги, чек, заметку, журнал и письмо клиенту
 * делает sales.intake.acceptWithReceipt.
 */
export const POST = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const staff = await apiStaff(req, "deals.edit");
  const { id } = idParams(await params, "id");
  const c = container();
  const deal = await c.sales.deals.findById(id);
  if (!deal) throw new HttpError(404, "dealNotFound");
  if (!canWork(staff, deal.assigneeId)) throw new HttpError(403, "forbidden");
  // По сделке оформлен заказ — дальше деньги идут через заказ (его оплату подтверждают в заказе), иначе их посчитают дважды.
  if (deal.orderId) throw new HttpError(409, "dealHasOrder");

  const form = await req.formData();
  const fields = paymentForm.parse({ kind: form.get("kind") ?? undefined, note: form.get("note") ?? undefined, amount: form.get("amount") ?? undefined, paidAt: form.get("paidAt") ?? undefined });
  const refund = fields.kind === "refund";
  const note = fields.note;
  if (refund && note.trim().length < 3) throw new HttpError(400, "refundNoReason");
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) throw new HttpError(400, "receiptRequired");
  // Размер — до чтения в память: большой файл не копируем ради отказа.
  if (file.size > RECEIPT_MAX_BYTES) throw receiptProblemError("tooBig");
  const bytes = Buffer.from(await file.arrayBuffer());
  const problem = receiptProblem(bytes);
  if (problem) throw receiptProblemError(problem);
  const amount = Number(fields.amount || 0);
  const day = fields.paidAt;
  if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new HttpError(400, "paymentDateInvalid");
  // Дата платежа — день по времени магазина (storeTimeZone); полдень, чтобы платёж не «съезжал» на соседние сутки.
  const paidAt = day ? fromZonedTime(`${day}T12:00:00`) : new Date();

  try {
    const { payment } = await c.sales.intake.acceptWithReceipt({
      deal,
      kind: refund ? "refund" : "payment",
      amount,
      paidAt,
      note,
      receipt: { bytes, fileName: file.name },
      actor: { userId: staff.user.id, name: staff.user.name || staff.user.email, seesAll: staff.scope === "all", allTasks: can(staff, "tasks.all") },
    });
    revalidatePath(`/admin/deals/${deal.id}`);
    revalidatePath("/admin");
    revalidatePath("/admin/analytics");
    return NextResponse.json({ payment: { id: payment.id, amount: payment.amount, kind: payment.kind, paidAt: payment.paidAt } });
  } catch (err) {
    if (PaymentError.is(err)) throw paymentProblemError(err.code);
    if (ReceiptError.is(err)) throw new HttpError(400, "receiptNotSaved");
    throw err;
  }
});
