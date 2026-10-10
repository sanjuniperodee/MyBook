import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { api, apiStaff, HttpError } from "@/server/api";
import { audit, can, canSeeAssigned } from "@/server/access";
import { container } from "@/server/container";
import { formatPrice } from "@/config/site";
import { PaymentError, RECEIPT_MAX_BYTES, ReceiptError } from "@/modules/sales";
import { sniffReceipt } from "@/modules/sales/domain";
import { mailPaymentToClient } from "@/server/client-mail";

export const maxDuration = 60;

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * Принять платёж (или оформить возврат: kind=refund, причина в note) по сделке: multipart — amount (₸), paidAt (YYYY-MM-DD, по умолчанию сегодня), note и file — чек
 * (скриншот, фото или PDF до 12 МБ). Платёж без чека не принимается. Деньги сразу попадают в обзор, аналитику и планы.
 */
export const POST = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const staff = await apiStaff(req, "deals.edit");
  const { id } = await params;
  const c = container();
  const deal = await c.sales.deals.findById(id);
  if (!deal) return bad("Сделка не найдена", 404);
  if (!canSeeAssigned(staff, deal.assigneeId)) throw new HttpError(403, "forbidden");
  // По сделке оформлен заказ — дальше деньги идут через заказ (его оплату подтверждают в заказе), иначе их посчитают дважды.
  if (deal.orderId) return bad("По сделке уже оформлен заказ: оплату принимайте в карточке заказа", 409);

  const form = await req.formData();
  const refund = form.get("kind") === "refund";
  const note = String(form.get("note") ?? "");
  if (refund && note.trim().length < 3) return bad("Укажите причину возврата");
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return bad("Приложите чек: платёж без чека не принимается");
  if (file.size > RECEIPT_MAX_BYTES) return bad("Файл больше 12 МБ");
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!sniffReceipt(bytes)) return bad("Нужен файл JPG, PNG, WEBP или PDF");
  const amount = Number(form.get("amount") ?? 0);
  const day = String(form.get("paidAt") ?? "");
  if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) return bad("Проверьте дату платежа");
  // Дата платежа — день по времени магазина; полдень, чтобы платёж не «съезжал» на соседние сутки.
  const paidAt = day ? new Date(`${day}T12:00:00+05:00`) : new Date();

  try {
    const payment = refund
      ? await c.sales.payments.refund({ dealId: deal.id, clientId: deal.clientId, amount, paidAt, note, createdById: staff.user.id })
      : await c.sales.payments.add({ dealId: deal.id, clientId: deal.clientId, amount, paidAt, note, createdById: staff.user.id });
    const receipt = await c.sales.receipts.add({ dealId: deal.id, clientId: deal.clientId, paymentId: payment.id, bytes, fileName: file.name, amount: payment.amount, uploadedById: staff.user.id });
    const actor = { userId: staff.user.id, name: staff.user.name || staff.user.email, seesAll: staff.scope === "all", allTasks: can(staff, "tasks.all") };
    await c.clients.notes.add(actor, { kind: "note", text: refund ? `Возврат ${formatPrice(payment.amount)} клиенту: ${payment.note}. Чек: ${receipt.fileName}` : `${payment.kind === "prepayment" ? "Предоплата" : "Платёж"} ${formatPrice(payment.amount)} принят(а). Чек: ${receipt.fileName}`, dealId: deal.id, clientId: deal.clientId ?? undefined });
    await audit(staff, "payment.add", "deal", deal.id, { payment: payment.id, amount: payment.amount, receipt: receipt.id });
    await mailPaymentToClient(c, { clientId: deal.clientId, dealNumber: deal.number, kind: refund ? "refund" : "payment", amount: payment.amount, left: Math.max(0, deal.amount - (await c.sales.payments.paidTotal(deal.id))) });
    revalidatePath(`/admin/deals/${deal.id}`);
    revalidatePath("/admin");
    revalidatePath("/admin/analytics");
    return NextResponse.json({ payment: { id: payment.id, amount: payment.amount, kind: payment.kind, paidAt: payment.paidAt } });
  } catch (err) {
    if (err instanceof PaymentError) return bad(err.code === "amount" ? "Проверьте сумму" : err.code === "refundTooBig" ? "Нельзя вернуть больше, чем принято" : "Дата не может быть в будущем");
    if (err instanceof ReceiptError) return bad("Не удалось сохранить чек");
    throw err;
  }
});
