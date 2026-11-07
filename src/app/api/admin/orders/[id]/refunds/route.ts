import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { api, apiStaff, HttpError } from "@/server/api";
import { audit, canSeeOrder } from "@/server/access";
import { container } from "@/server/container";
import { formText, idParams } from "@/server/input";
import { RECEIPT_MAX_BYTES, receiptProblem } from "@/shared/domain/receipt";
import { receiptProblemError } from "@/server/payment-errors";
import { staffLabel } from "@/shared/domain/staff";
import { OrderingError } from "@/modules/ordering";

export const maxDuration = 60;

const refundForm = z.object({ note: formText, amount: formText });

/**
 * Вернуть деньги клиенту по заказу (перевод): multipart — amount (₸), note — причина (от 3 символов), file — чек возврата
 * по желанию (скриншот, фото или PDF до 12 МБ). По отменённому заказу — до всего полученного, по живому — только
 * переплата (ordering.payments.refund). Права — orders.edit и заказ виден сотруднику. Возврат попадает в «Проверить».
 */
export const POST = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const staff = await apiStaff(req, "orders.edit");
  const { id } = idParams(await params, "id");
  if (!(await canSeeOrder(staff, id))) throw new HttpError(404, "orderNotFound");
  const form = await req.formData();
  const fields = refundForm.parse({
    note: form.get("note") ?? undefined,
    amount: form.get("amount") ?? undefined,
  });
  const file = form.get("file");
  let receipt: { bytes: Buffer; fileName: string } | null = null;
  if (file instanceof File && file.size) {
    // Размер — до чтения в память: большой файл не копируем ради отказа.
    if (file.size > RECEIPT_MAX_BYTES) throw receiptProblemError("tooBig");
    const bytes = Buffer.from(await file.arrayBuffer());
    const problem = receiptProblem(bytes);
    if (problem) throw receiptProblemError(problem);
    receipt = { bytes, fileName: file.name };
  }
  let result;
  try {
    result = await container().ordering.payments.refund({
      orderId: id,
      amount: Number(fields.amount || 0),
      note: fields.note,
      receipt,
      actor: {
        userId: staff.user.id,
        label: `admin:${staffLabel(staff.user)}`,
      },
    });
  } catch (err) {
    // Правило денег (больше переплаты, нет причины) — текст для сотрудника в самой ошибке.
    if (OrderingError.is(err) && err.code === "paymentRule") return NextResponse.json({ error: err.message }, { status: 409 });
    if (OrderingError.is(err) && err.code === "orderNotFound") throw new HttpError(404, "orderNotFound");
    throw err;
  }
  await audit(staff, "order.refund", "order", id, {
    payment: result.payment.id,
    amount: result.payment.amount,
    receipt: !!receipt,
    note: result.payment.note,
  });
  revalidatePath(`/admin/orders/${id}`);
  revalidatePath("/admin/finance");
  return NextResponse.json({
    payment: { id: result.payment.id, amount: result.payment.amount },
    refundable: result.refundable,
  });
});
