import "server-only";
import { formatPrice, getPlan, isQuotedDelivery } from "@/config/site";
import { container } from "@/server/container";
import { manualPaymentProps } from "@/server/requisites";
import { invoiceView } from "@/server/kaspi-view";
import { addonName, deliveryName, planName } from "@/i18n/labels";
import { deliveryAddress } from "@/modules/ordering/ui/labels";
import { orderStatusLabel, orderStatusTone } from "@/modules/ordering/ui/status";
import { isPaid } from "@/modules/ordering/domain";
import { orderSteps, nowKey } from "@/modules/ordering/ui/steps";
import { formatDate } from "@/lib/dates";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";
import type { KaspiInvoiceView } from "@/modules/ordering/ui/kaspi";

type Order = NonNullable<Awaited<ReturnType<ReturnType<typeof container>["ordering"]["queries"]["orderDetails"]>>>;

/** Счёт Kaspi для приложения: статус, ссылка в Kaspi, QR-код картинкой (SVG), срок. */
export const kaspiInvoice = (v: KaspiInvoiceView) => ({ id: v.id, method: v.method, status: v.status, amount: v.amount, phone: v.phone ?? null, link: v.link, qrSvg: v.qrSvg, expiresAt: v.expiresAt, paidAt: v.paidAt });

/**
 * Заказ клиента — одна модель для приложения (API v1 cabinetOrder), по правилам страницы /orders/[id]: что сейчас,
 * этапы, детали и чек, оплата (Kaspi Pay, перевод по реквизитам). Тексты — на языке пользователя.
 */
export async function orderModel(order: Order, own: boolean, locale: Locale, m: Messages) {
  const t = m.orders.order;
  const plan = getPlan(order.plan);
  const printed = !!plan?.printed;
  const paid = isPaid(order.status);
  const key = nowKey(order.status, printed);
  const steps = orderSteps(printed, t.steps);
  const at = steps.findIndex((s) => s.status === order.status);
  const kaspi = container().ordering.kaspi;
  const payable = own && order.status === "pending_payment";
  const [kaspiOn, current, manual] = payable ? await Promise.all([kaspi.available(), kaspi.current({ kind: "order", id: order.id }), manualPaymentProps(m)]) : [false, null, null];
  const deliveryQuoted = isQuotedDelivery(order.deliveryMethod) && !order.deliveryAmount;
  const facts: { label: string; value: string }[] = [
    { label: t.plan, value: `${planName(order.plan, locale)}${order.quantity > 1 ? ` × ${order.quantity}` : ""}` },
    ...(order.deliveryMethod ? [{ label: t.delivery, value: deliveryName(order.deliveryMethod, locale) }] : []),
    ...(order.address ? [{ label: t.address, value: deliveryAddress({ ...order, country: order.deliveryCountry }) }] : []),
    { label: t.recipient, value: `${order.contactName}, ${order.contactPhone}` },
    { label: t.email, value: order.contactEmail },
    ...(order.giftNote ? [{ label: t.card, value: `«${order.giftNote}»` }] : []),
    ...(order.desiredDate ? [{ label: t.neededBy, value: `${formatDate(order.desiredDate, false, locale)}${order.surprise ? t.surprise : ""}` }] : []),
    ...(order.customerComment ? [{ label: t.comment, value: order.customerComment }] : []),
  ];
  const lines: { label: string; value: string; tone: "plain" | "success" | "muted" }[] = [{ label: t.books, value: formatPrice(order.itemsAmount), tone: "plain" }];
  if (order.discountAmount) lines.push({ label: order.promoCode ? t.promo(order.promoCode) : t.agreedPrice, value: `−${formatPrice(order.discountAmount)}`, tone: "success" });
  if (order.addons.length) lines.push({ label: order.addons.map((a) => addonName(a, locale)).join(", "), value: formatPrice(order.addonsAmount), tone: "plain" });
  if (printed) lines.push({ label: t.delivery, value: order.deliveryAmount ? formatPrice(order.deliveryAmount) : deliveryQuoted ? t.quotedPrice : m.common.free, tone: deliveryQuoted ? "muted" : "plain" });
  if (order.prepaidAmount) lines.push({ label: t.prepaid, value: `−${formatPrice(order.prepaidAmount)}`, tone: "success" });
  const p = m.orders.payment;
  const k = m.common.kaspiPay;
  return {
    id: order.id,
    number: order.number,
    title: t.title(order.number),
    created: t.created(formatDate(order.createdAt, true, locale)),
    bookId: order.book.id,
    bookTitle: order.book.title,
    status: order.status,
    statusLabel: orderStatusLabel(order.status, locale, printed),
    tone: orderStatusTone[order.status],
    printed,
    paid,
    nowTitle: t.now.title[key],
    nowText: t.now.text[key],
    steps: order.status === "cancelled" ? [] : steps.map((s, i) => ({ label: s.label, state: i < at || (at === steps.length - 1 && i === at) ? "done" : i === at ? "current" : "todo" })),
    stepOf: order.status !== "cancelled" && at >= 0 ? t.stepOf(at + 1, steps.length) : null,
    trackingLabel: t.tracking,
    trackingNumber: order.trackingNumber,
    detailsTitle: t.details,
    facts,
    lines,
    totalLabel: order.prepaidAmount ? t.toPayNow : t.total,
    total: formatPrice(order.amount),
    quotedNote: printed && deliveryQuoted ? t.quotedNote : null,
    payment: payable
      ? {
          title: p.title,
          amount: formatPrice(order.amount),
          kaspi: kaspiOn
            ? {
                title: k.title,
                phoneLabel: k.phoneLabel,
                invoiceNote: k.invoiceNote,
                sendInvoice: k.sendInvoice,
                payByQr: k.payByQr,
                sentSteps: k.sentSteps,
                scanQr: k.scanQr,
                openKaspi: k.openKaspi,
                waiting: k.waiting,
                paid: k.paid,
                failed: k.failed,
                cancelled: k.cancelled,
                expired: k.expired,
                again: k.again,
                defaultPhone: order.contactPhone,
                current: current ? kaspiInvoice(await invoiceView(current)) : null,
              }
            : null,
          manual: manual ? { title: manual.title, steps: manual.steps, claim: p.claim, claimed: order.paymentClaimedAt ? p.claimed : null } : null,
          unavailable: m.common.manualPayment.unavailable,
          cancel: { label: p.cancel, title: p.cancelTitle, text: p.cancelText, confirm: p.cancelConfirm, keep: p.cancelKeep },
        }
      : null,
  };
}

/** Мои заказы для приложения: от новых к старым, со статусом и суммой. */
export async function ordersList(userId: string, locale: Locale, m: Messages) {
  const orders = await container().ordering.queries.userOrders(userId);
  const t = m.orders.list;
  return {
    title: t.title,
    lead: t.lead,
    empty: t.empty,
    emptyText: t.emptyText,
    orders: orders.map((o) => {
      const printed = !!getPlan(o.plan)?.printed;
      return { id: o.id, number: o.number, title: t.number(o.number), bookTitle: o.book?.title ?? "", bookId: o.bookId, status: o.status, statusLabel: orderStatusLabel(o.status, locale, printed), tone: orderStatusTone[o.status], amount: formatPrice(o.amount), created: formatDate(o.createdAt, false, locale), pay: o.status === "pending_payment" ? t.pay : null };
    }),
  };
}
