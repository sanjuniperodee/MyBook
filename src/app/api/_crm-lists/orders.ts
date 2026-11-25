/**
 * Заказы для производства — выборки для /api/mobile/orders и API v1 (crmOrdersList, crmOrder): одна выборка, одни права.
 */
import { can, canSeeOrder, contactView, staffViewer, type Staff } from "@/server/access";
import { container } from "@/server/container";
import { HttpError } from "@/server/api";
import { nowMs } from "@/lib/dates";
import { formatPrice, getPlan, isQuotedDelivery } from "@/config/site";
import { addonName, deliveryName, planName } from "@/i18n/labels";
import { staffLabel } from "@/shared/domain/staff";
import { deliveryAddress } from "@/modules/ordering/ui/labels";
import { orderStatusLabels } from "@/modules/ordering/ui/status";
import { ORDER_STATUSES } from "@/shared/domain/orders";

const DAY_MS = 86_400_000;

/**
 * Канбан доски CRM: карточки за 30 дней по статусам с признаками «срочно», «сюрприз», «клиент сообщил об оплате»,
 * сроком и ответственным. Статусы и их подписи — в ответе, приложение рисует колонки.
 */
export async function mobileOrders(staff: Staff) {
  const monthAgo = new Date(nowMs() - 30 * DAY_MS);
  const [rows, admins] = await Promise.all([container().reporting.productionBoard(monthAgo, staffViewer(staff)), container().access.queries.allStaff()]);
  const names = new Map(admins.map((a) => [a.id, staffLabel(a)]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return {
    canEdit: can(staff, "orders.edit"),
    statuses: ORDER_STATUSES.map((s) => ({ key: s, label: orderStatusLabels[s] })),
    orders: rows.map((o) => {
      const plan = getPlan(o.plan);
      return {
        id: o.id,
        number: o.number,
        status: o.status,
        contactName: o.contactName,
        planName: planName(o.plan),
        printed: !!plan?.printed,
        quantity: o.quantity,
        amount: o.amount,
        amountLabel: formatPrice(o.amount),
        desiredDate: o.desiredDate,
        daysLeft: o.desiredDate ? Math.round((new Date(`${o.desiredDate}T00:00:00`).getTime() - today.getTime()) / DAY_MS) : null,
        claimed: o.status === "pending_payment" && !!o.paymentClaimedAt,
        surprise: o.surprise,
        giftNote: !!o.giftNote,
        express: o.plan === "premium" || o.addons.includes("express"),
        assignee: o.assigneeId ? (names.get(o.assigneeId) ?? null) : null,
        ageDays: Math.floor((nowMs() - o.createdAt.getTime()) / DAY_MS),
      };
    }),
  };
}

/** Карточка заказа для производства: получатель, доставка, книга, пожелания и журнал (файлы типографии — crmOrderFiles). */
export async function mobileOrder(staff: Staff, id: string) {
  const order = await container().ordering.queries.orderDetails(id);
  if (!order || !(await canSeeOrder(staff, order.id))) throw new HttpError(404, "notFound");
  const plan = getPlan(order.plan);
  const contact = contactView(staff, { phone: order.contactPhone, email: order.contactEmail });
  return {
    id: order.id,
    number: order.number,
    status: order.status,
    statusLabel: orderStatusLabels[order.status],
    canEdit: can(staff, "orders.edit"),
    planName: planName(order.plan),
    printed: !!plan?.printed,
    quantity: order.quantity,
    amountLabel: formatPrice(order.amount),
    addons: order.addons.map((a: string) => addonName(a)),
    book: { title: order.book.title, author: order.book.authorName, recipient: order.book.recipientName },
    contact: { name: order.contactName, phone: contact.phone || null, email: contact.email || null, masked: contact.masked },
    delivery: plan?.printed ? { method: deliveryName(order.deliveryMethod), quoted: isQuotedDelivery(order.deliveryMethod) && !order.deliveryAmount, address: deliveryAddress({ ...order, country: order.deliveryCountry }) || null } : null,
    tracking: order.trackingNumber ?? null,
    desiredDate: order.desiredDate,
    comment: order.customerComment || null,
    giftNote: order.giftNote || null,
    surprise: order.surprise,
    claimed: order.status === "pending_payment" && !!order.paymentClaimedAt,
    events: order.events.slice(0, 20).map((e: { id: string; status: string | null; note: string | null; createdAt: Date }) => ({
      id: e.id,
      status: e.status ? orderStatusLabels[e.status as keyof typeof orderStatusLabels] : null,
      note: e.note,
      at: e.createdAt.toISOString(),
    })),
  };
}
