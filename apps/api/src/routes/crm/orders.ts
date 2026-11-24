/**
 * Заказ в приложении CRM: деньги (оплата с чеком, возврат, отмена и сверка платежа, постоплата, тариф и цена, просьба
 * руководителю) и доставка (статус, трек). Логика денег одна на сайт и приложение: обработчики зовут те же маршруты
 * (/api/admin/orders/<id>/payments, …/refunds) и действия карточки заказа — права, «только свои», правила денег, журнал.
 */
import { getPlan, getPlans } from "@/config/site";
import { planName } from "@/i18n/labels";
import { formatDate } from "@/lib/dates";
import { apiStaff, HttpError } from "@/server/api";
import { can, canSeeOrder } from "@/server/access";
import { container } from "@/server/container";
import { discountLimit } from "@/server/discount";
import { payFormOptions } from "@/server/pay-form";
import { staffLabel } from "@/shared/domain/staff";
import { ORDER_STATUSES } from "@/shared/domain/orders";
import { isPrintedPlan, orderStatusLabel } from "@/modules/ordering/ui/status";
import { changeOrderTermsAction, requestOrderRepriceAction, reviewOrderPaymentAction, startPostpayAction, updateOrderAction, voidOrderPaymentAction } from "@/app/admin/actions";
import { POST as payRoute } from "@/app/api/admin/orders/[id]/payments/route";
import { POST as refundRoute } from "@/app/api/admin/orders/[id]/refunds/route";
import type { Handlers } from "../../app";
import { refused } from "./common";

const METHOD: Record<string, string> = { manual: "перевод или вручную", kaspi: "Kaspi", cloudpayments: "карта (CloudPayments)" };

/** Итог действия карточки заказа ({ ok } / { error }) — ответом контракта. */
const done = (r: { ok?: string; error?: string }, fallback = "Сохранено") => (r.error ? refused(r.error) : { ok: true as const, message: r.ok ?? fallback });

/**
 * Маршрут денег сайта с теми же полями формы: сумма, дата, чек. Вход и права он проверяет сам (заголовки текущего
 * запроса); его ответ с ошибкой — как есть, успех — текстом для сотрудника.
 */
async function siteMoney(route: typeof payRoute, req: Request, orderId: string, fields: Record<string, string | undefined>, file: Blob | undefined) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== "") form.set(k, v);
  if (file) form.set("file", file, (file as File).name || "receipt");
  const res = await route(new Request(req.url, { method: "POST", headers: { authorization: req.headers.get("authorization") ?? "" }, body: form }), { params: Promise.resolve({ id: orderId }) });
  return { res, data: res.ok ? ((await res.clone().json()) as Record<string, unknown>) : null };
}

export const crmOrderHandlers: Pick<
  Handlers,
  "crmOrderMoney" | "crmOrderPay" | "crmOrderRefund" | "crmOrderPaymentVoid" | "crmOrderPaymentReview" | "crmOrderPostpay" | "crmOrderTerms" | "crmOrderRepriceRequest" | "crmOrderDelivery"
> = {
  async crmOrderMoney({ req, input }) {
    const staff = await apiStaff(req, "orders.view");
    const c = container();
    const order = await c.ordering.queries.orderDetails(input.orderId);
    if (!order || !(await canSeeOrder(staff, order.id))) throw new HttpError(404, "notFound");
    const [rows, admins, payForms] = await Promise.all([c.ordering.payments.list(order.id), c.access.queries.allStaff(), payFormOptions()]);
    const name = new Map(admins.map((a) => [a.id, staffLabel(a)]));
    const plan = getPlan(order.plan);
    const printed = isPrintedPlan(order.plan);
    const canEdit = can(staff, "orders.edit");
    const canRepricePaid = can(staff, "orders.reprice_paid");
    const cancelled = order.status === "cancelled";
    const canTerms = canEdit && !cancelled && (!order.paidAt || canRepricePaid);
    return {
      id: order.id,
      number: order.number,
      status: order.status,
      statusLabel: orderStatusLabel(order.status, "ru", printed),
      statuses: ORDER_STATUSES.map((s) => ({ id: s, label: orderStatusLabel(s, "ru", printed) })),
      printed,
      trackingNumber: order.trackingNumber ?? null,
      amount: order.amount,
      received: order.receivedAmount,
      // Как Order.refundable: по отменённому — всё полученное, по живому — переплата (проверяет и сервер).
      refundable: cancelled ? Math.max(0, order.receivedAmount) : Math.max(0, order.receivedAmount - order.amount),
      settled: !!order.paidAt,
      postpay: !!order.postpay,
      cancelled,
      payments: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        amount: r.amount,
        method: METHOD[r.method] ?? r.method,
        at: r.paidAt.toISOString(),
        note: r.note || null,
        receipt: !!r.receipt,
        payForm: r.payForm ?? null,
        by: r.createdById ? (name.get(r.createdById) ?? null) : null,
        reviewed: r.reviewedAt ? `${r.reviewedById ? (name.get(r.reviewedById) ?? "") : ""} ${formatDate(r.reviewedAt)}`.trim() : null,
        voided: !!r.voidedAt,
        voidReason: r.voidedAt ? (r.voidReason ?? "") : null,
      })),
      payForms,
      plan: order.plan,
      plans: getPlans().map((p) => ({ id: p.id, label: planName(p.id) + (p.hidden ? " (скрыт)" : ""), price: p.price })),
      // Договорённая цена первого экземпляра: скидка заказа без промокода — это и есть договорённость (как на сайте).
      agreed: order.discountAmount > 0 && !order.promoCode && plan ? order.itemsAmount - order.discountAmount - (order.itemsAmount - plan.price) : null,
      maxDiscountPercent: canTerms ? await discountLimit(staff) : null,
      canEdit,
      canVoid: canEdit && can(staff, "orders.payment_void"),
      canReview: canEdit && can(staff, "team.manage"),
      canTerms,
      canRequestReprice: canEdit && !cancelled && !!order.paidAt && !canRepricePaid,
    };
  },

  async crmOrderPay({ req, input }) {
    const { res, data } = await siteMoney(payRoute, req, input.orderId, { amount: input.amount, paidAt: input.paidAt, note: input.note, payForm: input.payForm, requestKey: input.requestKey }, input.files[0]);
    if (!data) return res;
    const overpaid = Number(data.overpaid ?? 0);
    return { ok: true, message: data.settled ? `Оплата записана, заказ оплачен${overpaid > 0 ? ` — переплата ${overpaid.toLocaleString("ru-RU")} ₸` : ""}` : "Оплата записана" };
  },

  async crmOrderRefund({ req, input }) {
    const { res, data } = await siteMoney(refundRoute, req, input.orderId, { amount: input.amount, note: input.note, requestKey: input.requestKey }, input.files[0]);
    if (!data) return res;
    return { ok: true, message: "Возврат записан" };
  },

  async crmOrderPaymentVoid({ req, input }) {
    await apiStaff(req, "orders.edit");
    return done(await voidOrderPaymentAction(input.paymentId, input.body.reason), "Платёж отменён");
  },

  async crmOrderPaymentReview({ req, input }) {
    await apiStaff(req, "orders.edit");
    return done(await reviewOrderPaymentAction(input.paymentId), "Отмечено: проверено");
  },

  async crmOrderPostpay({ req, input }) {
    await apiStaff(req, "orders.edit");
    return done(await startPostpayAction(input.orderId, input.body.reason));
  },

  async crmOrderTerms({ req, input }) {
    await apiStaff(req, "orders.edit");
    const form = new FormData();
    form.set("orderId", input.orderId);
    form.set("plan", input.body.plan);
    form.set("agreedTotal", input.body.agreedTotal === null ? "" : String(input.body.agreedTotal));
    if (input.body.reason) form.set("reason", input.body.reason);
    return done(await changeOrderTermsAction({}, form));
  },

  async crmOrderRepriceRequest({ req, input }) {
    await apiStaff(req, "orders.edit");
    return done(await requestOrderRepriceAction(input.orderId, String(input.body.price), input.body.reason));
  },

  async crmOrderDelivery({ req, input }) {
    await apiStaff(req, "orders.edit");
    const form = new FormData();
    form.set("orderId", input.orderId);
    form.set("status", input.body.status);
    if (input.body.trackingNumber !== undefined) form.set("trackingNumber", input.body.trackingNumber);
    if (input.body.note) form.set("note", input.body.note);
    return done(await updateOrderAction({}, form));
  },
};
