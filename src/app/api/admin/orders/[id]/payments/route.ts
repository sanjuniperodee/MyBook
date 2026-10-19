import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { api, apiStaff, HttpError } from "@/server/api";
import { audit } from "@/server/access";
import { container } from "@/server/container";
import { formText, idParams } from "@/server/input";
import { RECEIPT_MAX_BYTES, receiptProblem } from "@/shared/domain/receipt";
import { receiptProblemError } from "@/server/payment-errors";
import { fromZonedTime } from "@/shared/domain/time";
import { staffLabel } from "@/shared/domain/staff";
import { OrderingError } from "@/modules/ordering";

export const maxDuration = 60;

const paymentForm = z.object({ note: formText, amount: formText, paidAt: formText });

/**
 * Принять оплату по заказу (перевод, остаток, постоплата): multipart — amount (₸), paidAt (YYYY-MM-DD, по умолчанию сегодня),
 * note и file — чек (скриншот, фото или PDF до 12 МБ). В любом статусе заказа, кроме отменённого. Деньги покрыли «к оплате» —
 * заказ оплачен (или постоплата получена); выручка от записи не задваивается.
 */
export const POST = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const staff = await apiStaff(req, "orders.edit");
  const { id } = idParams(await params, "id");
  const form = await req.formData();
  const fields = paymentForm.parse({ note: form.get("note") ?? undefined, amount: form.get("amount") ?? undefined, paidAt: form.get("paidAt") ?? undefined });
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) throw new HttpError(400, "receiptRequired");
  if (file.size > RECEIPT_MAX_BYTES) throw receiptProblemError("tooBig");
  const bytes = Buffer.from(await file.arrayBuffer());
  const problem = receiptProblem(bytes);
  if (problem) throw receiptProblemError(problem);
  const day = fields.paidAt;
  if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new HttpError(400, "paymentDateInvalid");
  // День оплаты — по времени магазина; полдень, чтобы оплата не «съезжала» на соседние сутки. Сегодня — сейчас.
  const paidAt = day ? new Date(Math.min(fromZonedTime(`${day}T12:00:00`).getTime(), Date.now())) : new Date();
  let result;
  try {
    result = await container().ordering.payments.acceptManual({
    orderId: id,
    amount: Number(fields.amount || 0),
    paidAt,
    note: fields.note,
    receipt: { bytes, fileName: file.name },
    actor: { userId: staff.user.id, label: `admin:${staffLabel(staff.user)}` },
    });
  } catch (err) {
    // Правило денег (заказ отменён) — текст для сотрудника в самой ошибке.
    if (OrderingError.is(err) && err.code === "paymentRule") return NextResponse.json({ error: err.message }, { status: 409 });
    throw err;
  }
  await audit(staff, "order.payment", "order", id, { payment: result.payment.id, amount: result.payment.amount, settled: result.settled, overpaid: result.overpaid });
  revalidatePath(`/admin/orders/${id}`);
  revalidatePath("/admin/finance");
  return NextResponse.json({ payment: { id: result.payment.id, amount: result.payment.amount }, settled: result.settled, overpaid: result.overpaid });
});
