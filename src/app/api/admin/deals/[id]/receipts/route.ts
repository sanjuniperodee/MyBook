import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { api, apiStaff, HttpError } from "@/server/api";
import { audit, can, canSeeAssigned } from "@/server/access";
import { container } from "@/server/container";
import { formatPrice } from "@/config/site";
import { MAX_PAYMENT, ReceiptError, RECEIPT_MAX_BYTES } from "@/modules/sales";
import { receiptProblemError } from "@/server/payment-errors";
import { z } from "zod";
import { formText, idParams, uuid } from "@/server/input";

export const maxDuration = 60;

/** Поля формы чека, кроме файла: сумма текстом и платёж этой сделки (UUID или пусто; иначе — «Платёж не найден»). Подмена → 400. */
const receiptForm = z.object({ amount: formText, paymentId: formText.refine((v) => v === "" || uuid.safeParse(v).success, "paymentNotFound") });

/** Приложить чек об оплате к сделке: multipart — file (фото, скриншот или PDF до 12 МБ) и amount (сумма платежа, ₸). */
export const POST = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const staff = await apiStaff(req, "deals.edit");
  const { id } = idParams(await params, "id");
  const deal = await container().sales.deals.findById(id);
  if (!deal) throw new HttpError(404, "dealNotFound");
  if (!canSeeAssigned(staff, deal.assigneeId)) throw new HttpError(403, "forbidden");

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) throw new HttpError(400, "receiptPick");
  if (file.size > RECEIPT_MAX_BYTES) throw receiptProblemError("tooBig");
  const fields = receiptForm.parse({ amount: form.get("amount") ?? undefined, paymentId: form.get("paymentId") ?? undefined });
  const amount = Number(fields.amount || 0);
  if (!Number.isFinite(amount) || amount < 0 || amount > MAX_PAYMENT) throw new HttpError(400, "amountInvalid");

  // Чек можно привязать к платежу этой же сделки (так делает форма «Новый клиент»: платёж создан, чек догружается).
  const paymentId = fields.paymentId || null;
  if (paymentId) {
    const payment = await container().sales.payments.find(paymentId);
    if (!payment || payment.dealId !== deal.id) throw new HttpError(400, "paymentNotFound");
  }
  try {
    const row = await container().sales.receipts.add({ dealId: deal.id, clientId: deal.clientId, paymentId, bytes: Buffer.from(await file.arrayBuffer()), fileName: file.name, amount, uploadedById: staff.user.id });
    const actor = { userId: staff.user.id, name: staff.user.name || staff.user.email, seesAll: staff.scope === "all", allTasks: can(staff, "tasks.all") };
    await container().clients.notes.add(actor, { kind: "note", text: `Приложен чек${row.amount ? ` на ${formatPrice(row.amount)}` : ""}: ${row.fileName}`, dealId: deal.id, clientId: deal.clientId ?? undefined });
    await audit(staff, "receipt.add", "deal", deal.id, { receipt: row.id, amount: row.amount });
    revalidatePath(`/admin/deals/${deal.id}`);
    return NextResponse.json({ receipt: { id: row.id, fileName: row.fileName, amount: row.amount, mime: row.mime, size: row.size, createdAt: row.createdAt } });
  } catch (err) {
    if (ReceiptError.is(err)) throw receiptProblemError(err.code);
    throw err;
  }
});
