import { NextResponse } from "next/server";
import { apiStaff, HttpError } from "@/server/api";
import { can, canSeeOrder, contactView } from "@/server/access";
import { container } from "@/server/container";
import { idParams } from "@/server/input";
import { mobile } from "@/server/mobile-api";
import { formatPrice, getPlan, isQuotedDelivery } from "@/config/site";
import { addonName, deliveryName, planName } from "@/i18n/labels";
import { deliveryAddress } from "@/modules/ordering/ui/labels";
import { orderStatusLabels } from "@/modules/ordering/ui/status";

export const dynamic = "force-dynamic";

/** Карточка заказа для производства: получатель, доставка, книга, пожелания и журнал (без файлов типографии — они в CRM). */
export const GET = mobile(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const staff = await apiStaff(req, "orders.view");
  const { id } = idParams(await params, "id");
  const order = await container().ordering.queries.orderDetails(id);
  if (!order || !(await canSeeOrder(staff, order.id))) throw new HttpError(404, "notFound");
  const plan = getPlan(order.plan);
  const contact = contactView(staff, { phone: order.contactPhone, email: order.contactEmail });
  return NextResponse.json({
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
    events: order.events.slice(0, 20).map((e: { id: string; status: string | null; note: string | null; createdAt: Date }) => ({ id: e.id, status: e.status ? orderStatusLabels[e.status as keyof typeof orderStatusLabels] : null, note: e.note, at: e.createdAt.toISOString() })),
  });
});
