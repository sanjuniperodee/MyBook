import "server-only";
import { z } from "zod";
import { can, canSeeOrder, staffViewer } from "@/server/access";
import { container } from "@/server/container";
import { uuid } from "@/server/input";
import { ORDER_STATUSES as orderStatuses } from "@/shared/domain/orders";
import { isPhoneEmail } from "@/modules/identity/domain/Login";
import { op } from "./op";

/** Сборщики страниц заказов CRM (ADR 0012, A5 — Раздел 5): список с числами на чипах и карточка заказа. */
const filters = z.object({
  status: z.string().max(40).optional(),
  q: z.string().max(200).optional(),
  plan: z.string().max(40).optional(),
  assignee: z.string().max(40).optional(),
  from: z.string().max(20).optional(),
  to: z.string().max(20).optional(),
});

/**
 * Что получит клиент при смене статуса: настоящая ли почта, правила WhatsApp о заказе (о чём уже писали), переписка,
 * стоп-лист, рабочее ли время и открыты ли окно и суточный лимит сообщений от правил.
 */
async function noticeFacts(order: { id: string; userId: string; contactEmail: string; contactPhone: string; trackingNumber: string | null }) {
  const n = await container().reporting.orderNotice(order);
  const [noMarketing, pause, workTime] = await Promise.all([
    container().messaging.chats.noMarketingFor({ dealId: n.dealId, clientId: order.userId, phones: [order.contactPhone] }),
    n.rules.length ? container().messaging.chats.ruleSendPause() : null,
    n.rules.some((r) => r.hours) ? container().workspace.schedule.isWorkTime(new Date()) : true,
  ]);
  return { realEmail: !isPhoneEmail(order.contactEmail), rules: n.rules, whatsappChat: n.whatsappChat, noMarketing, workTime, pause };
}

export const reads = {
  "orders.list": op(["orders.view"], z.object({ filters, page: z.number().int().min(1).max(10_000), size: z.number().int().min(1).max(200) }), async ({ filters: f, page, size }, staff) => {
    const viewer = staffViewer(staff);
    const reporting = container().reporting;
    // Числа на чипах — по тем же фильтрам, но без выбранного статуса (иначе у остальных чипов стояли бы нули).
    const [result, admins, counts] = await Promise.all([
      reporting.orderList(f, viewer, page, size),
      container().access.queries.allStaff(),
      Promise.all(orderStatuses.map((s) => reporting.orderList({ ...f, status: s }, viewer, 1, 1).then((r) => r.n))),
    ]);
    return { ...result, admins, counts };
  }),

  "orders.card": op(["orders.view"], z.object({ id: uuid }), async ({ id }, staff) => {
    const order = await container().ordering.queries.orderDetails(id);
    if (!order || !(await canSeeOrder(staff, order.id))) return null;
    const [{ payFormOptions }, { discountLimit }] = await Promise.all([import("@/server/pay-form"), import("@/server/discount")]);
    const [stats, admins, crm, kaspiInvoices, moneyRows, built, payForms] = await Promise.all([
      container().authoring.queries.stats(order.book),
      container().access.queries.allStaff(),
      container().reporting.orderCrm(order),
      container().ordering.queries.paymentInvoices("order", order.id),
      container().ordering.payments.list(order.id),
      container().previews.current(order.book.id).catch(() => null),
      payFormOptions(),
    ]);
    const canEdit = can(staff, "orders.edit");
    const termsOpen = canEdit && order.status !== "cancelled" && (!order.paidAt || can(staff, "orders.reprice_paid"));
    const [notice, maxDiscount] = await Promise.all([canEdit ? noticeFacts(order) : null, termsOpen ? discountLimit(staff) : null]);
    return { order, stats, admins, crm, kaspiInvoices, moneyRows, built, payForms, notice, maxDiscount };
  }),
};
