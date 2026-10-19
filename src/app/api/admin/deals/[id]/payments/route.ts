import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { api, apiStaff, HttpError } from "@/server/api";
import { can, canWork } from "@/server/access";
import { container } from "@/server/container";
import { PaymentError, ReceiptError } from "@/modules/sales";
import { OrderingError } from "@/modules/ordering";
import { RECEIPT_MAX_BYTES, receiptProblem } from "@/modules/sales/domain";
import { paymentProblemError, receiptProblemError } from "@/server/payment-errors";
import { fromZonedTime } from "@/shared/domain/time";
import { z } from "zod";
import { formText, idParams } from "@/server/input";
import { formatPrice } from "@/config/site";
import { RECENT_ONLINE_MS } from "@/components/admin/invoices/model";

export const maxDuration = 60;

/**
 * Поля формы платежа, кроме файла чека: тексты; вид — платёж или возврат. Подмена (файл вместо текста) → 400.
 * invoiceId — оплата по счёту из чата; seen — «это другая оплата»: открытый счёт и онлайн-оплаты, которые менеджер видел в форме.
 */
const paymentForm = z.object({ kind: z.enum(["payment", "refund", ""]).default(""), note: formText, amount: formText, paidAt: formText, invoiceId: formText, seen: formText });

/**
 * Защита от двойной записи: ручной платёж «не по счёту» при открытом счёте или недавней онлайн-оплате принимается, только
 * если менеджер их видел и явно выбрал «это другая оплата» (seen). Пока форма была открыта, пришла оплата — 409, обновить.
 */
async function unseenMoney(dealId: string, seen: string) {
  const c = container();
  const known = new Set(seen.split(",").filter(Boolean));
  const [invoices, payments] = await Promise.all([c.ordering.invoices.listFor(dealId), c.sales.payments.list(dealId)]);
  const open = invoices.find((i) => i.status === "pending_payment" && !known.has(i.id));
  if (open) return `По сделке открыт счёт ${open.label} на ${formatPrice(open.amount)}: отметьте, оплата по нему или другая`;
  const since = Date.now() - RECENT_ONLINE_MS;
  const online = payments.find((p) => p.method !== "manual" && p.kind !== "refund" && p.paidAt.getTime() >= since && !known.has(p.id));
  if (online) return `Недавно пришла онлайн-оплата ${formatPrice(online.amount)} (${online.method === "kaspi" ? "Kaspi" : "картой"}) — обновите страницу и проверьте, что это не она`;
  return null;
}

/**
 * Принять платёж (или оформить возврат: kind=refund, причина в note) по сделке: multipart — amount (₸), paidAt (YYYY-MM-DD, по умолчанию сегодня), note и file — чек
 * (скриншот, фото или PDF до 12 МБ). Роут разбирает форму и проверяет права; деньги, чек, заметку, журнал и письмо клиенту
 * делает sales.intake.acceptWithReceipt. По счёту из чата (invoiceId) — ровно сумма счёта; иначе при открытом счёте или
 * онлайн-оплате за 72 ч нужен явный выбор «это другая оплата» (seen), см. unseenMoney.
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
  const fields = paymentForm.parse({ kind: form.get("kind") ?? undefined, note: form.get("note") ?? undefined, amount: form.get("amount") ?? undefined, paidAt: form.get("paidAt") ?? undefined, invoiceId: form.get("invoiceId") ?? undefined, seen: form.get("seen") ?? undefined });
  // «Оплата пришла» по счёту из чата: счёт этой сделки, ждёт оплаты; сумма — ровно сумма счёта.
  const invoice = fields.invoiceId ? await c.ordering.invoices.byId(fields.invoiceId) : null;
  if (fields.invoiceId && (!invoice || invoice.dealId !== deal.id)) throw new HttpError(404, "notFound");
  if (invoice && invoice.status === "paid") return NextResponse.json({ error: `Счёт ${invoice.label} уже оплачен` }, { status: 409 });
  const refund = fields.kind === "refund";
  if (invoice && refund) return NextResponse.json({ error: "Возврат оформляется без счёта" }, { status: 400 });
  if (invoice && Number(fields.amount) !== invoice.amount)
    return NextResponse.json({ error: `Сумма по счёту ${invoice.label} — ${formatPrice(invoice.amount)}. Если клиент заплатил часть, примите оплату как «другую»` }, { status: 400 });
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
  if (!refund && !invoice) {
    const unseen = await unseenMoney(deal.id, fields.seen);
    if (unseen) return NextResponse.json({ error: unseen, code: "invoiceChoice" }, { status: 409 });
  }

  try {
    const { payment } = await c.sales.intake.acceptWithReceipt({
      deal,
      kind: refund ? "refund" : "payment",
      amount,
      paidAt,
      note,
      receipt: { bytes, fileName: file.name },
      invoice: invoice ? { id: invoice.id, amount: invoice.amount } : null,
      actor: { userId: staff.user.id, name: staff.user.name || staff.user.email, seesAll: staff.scope === "all", allTasks: can(staff, "tasks.all") },
    });
    revalidatePath(`/admin/deals/${deal.id}`);
    revalidatePath("/admin");
    revalidatePath("/admin/analytics");
    return NextResponse.json({ payment: { id: payment.id, amount: payment.amount, kind: payment.kind, paidAt: payment.paidAt } });
  } catch (err) {
    if (OrderingError.is(err) && err.code === "paymentRule") return NextResponse.json({ error: err.message }, { status: 409 });
    if (PaymentError.is(err)) throw paymentProblemError(err.code);
    if (ReceiptError.is(err)) throw new HttpError(400, "receiptNotSaved");
    throw err;
  }
});
