import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "./db";
import { books, orderEvents, orders, type Order, type OrderStatus } from "./db/schema";
import { deliveryOptions, formatPrice, getPlan, type DeliveryId, type PlanId } from "@/config/site";
import { env } from "./env";
import { emailLayout, escapeHtml, sendMail } from "./mail";
import { orderStatusLabel } from "./orders-shared";
import { fileExists, getFile, putFile } from "./storage";
import { loadBookBundle, printSpecText, renderPrintPackage, renderReadingPdf } from "./pdf/render";

export interface PriceBreakdown {
  itemsAmount: number;
  deliveryAmount: number;
  amount: number;
}

export function calculatePrice(planId: PlanId, quantity: number, delivery: DeliveryId | null): PriceBreakdown {
  const plan = getPlan(planId);
  if (!plan) throw new Error("Unknown plan");
  const qty = plan.printed ? Math.min(Math.max(1, Math.floor(quantity)), 20) : 1;
  const itemsAmount = plan.price + (qty - 1) * (plan.extraCopyPrice ?? plan.price);
  const deliveryAmount = plan.printed ? (deliveryOptions.find((d) => d.id === delivery)?.price ?? 0) : 0;
  return { itemsAmount, deliveryAmount, amount: itemsAmount + deliveryAmount };
}

export async function addOrderEvent(orderId: string, status: OrderStatus | null, note: string, actor: string) {
  await db.insert(orderEvents).values({ orderId, status, note, actor });
}

export async function getOrderWithBook(orderId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return null;
  return db.query.orders.findFirst({
    where: eq(orders.id, orderId),
    with: { book: true, user: true, events: { orderBy: desc(orderEvents.createdAt) } },
  });
}

function orderUrl(order: Order) {
  return `${env.appUrl}/orders/${order.id}`;
}

/** Смена статуса заказа + журнал + письмо клиенту. */
export async function setOrderStatus(orderId: string, status: OrderStatus, actor: string, note = "", extra: Partial<Order> = {}) {
  const [order] = await db
    .update(orders)
    .set({ status, ...(status === "paid" ? { paidAt: new Date() } : {}), ...extra })
    .where(eq(orders.id, orderId))
    .returning();
  if (!order) throw new Error("Order not found");
  await addOrderEvent(orderId, status, note, actor);
  if (status === "cancelled") {
    // книгу снова можно редактировать, если нет других активных заказов
    const others = await db.select({ id: orders.id, status: orders.status }).from(orders).where(eq(orders.bookId, order.bookId));
    if (!others.some((o) => o.id !== order.id && o.status !== "cancelled")) {
      await db.update(books).set({ status: "draft" }).where(eq(books.id, order.bookId));
    }
  }
  await notifyCustomer(order, status);
  return order;
}

export async function markOrderPaid(orderId: string, actor: string, paymentId?: string) {
  const current = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (!current) throw new Error("Order not found");
  if (current.status !== "pending_payment") return current;
  const order = await setOrderStatus(orderId, "paid", actor, paymentId ? `Платёж ${paymentId}` : "Оплата подтверждена", paymentId ? { paymentId } : {});
  if (env.ordersNotifyEmail) {
    await sendMail(
      env.ordersNotifyEmail,
      `Оплачен заказ №${order.number}`,
      emailLayout({ title: `Заказ №${order.number} оплачен`, paragraphs: [`Сумма: ${formatPrice(order.amount)}`, `Тариф: ${getPlan(order.plan)?.name}`], button: { label: "Открыть в админке", url: `${env.appUrl}/admin/orders/${order.id}` } }),
    );
  }
  return order;
}

async function notifyCustomer(order: Order, status: OrderStatus) {
  const plan = getPlan(order.plan);
  const button = { label: "Открыть заказ", url: orderUrl(order) };
  const t = (title: string, paragraphs: string[]) => sendMail(order.contactEmail, `${title} — заказ №${order.number}`, emailLayout({ title, paragraphs, button }));
  switch (status) {
    case "paid":
      return t("Спасибо! Оплата получена", [
        `Заказ №${order.number} на сумму ${formatPrice(order.amount)} оплачен.`,
        plan?.printed ? "Мы уже готовим книгу к печати. Как только она будет отправлена, пришлём письмо с трек-номером." : "Электронная версия книги уже доступна для скачивания на странице заказа.",
      ]);
    case "in_production":
      return t("Книга в производстве", ["Ваша книга отправлена в печать. Обычно это занимает несколько рабочих дней."]);
    case "shipped":
      return t("Книга в пути", [
        "Ваша книга напечатана и передана в доставку.",
        order.trackingNumber ? `Трек-номер: <b>${escapeHtml(order.trackingNumber)}</b>` : "",
      ].filter(Boolean));
    case "delivered":
      return t("Книга доставлена", ["Надеемся, подарок получился особенным. Будем рады вашему отзыву!"]);
    case "cancelled":
      return t("Заказ отменён", ["Заказ отменён. Книгу снова можно редактировать и оформить новый заказ."]);
    default:
      return;
  }
}

export async function notifyNewOrder(order: Order) {
  const plan = getPlan(order.plan);
  await sendMail(
    order.contactEmail,
    `Заказ №${order.number} оформлен`,
    emailLayout({
      title: "Заказ оформлен",
      paragraphs: [`Номер заказа: <b>№${order.number}</b>`, `Тариф: ${plan?.name}, ${order.quantity} экз.`, `Сумма к оплате: <b>${formatPrice(order.amount)}</b>`],
      button: { label: "Перейти к оплате", url: orderUrl(order) },
    }),
  );
  if (env.ordersNotifyEmail) {
    await sendMail(
      env.ordersNotifyEmail,
      `Новый заказ №${order.number}`,
      emailLayout({
        title: `Новый заказ №${order.number}`,
        paragraphs: [`${escapeHtml(order.contactName)}, ${escapeHtml(order.contactPhone)}`, `${plan?.name} × ${order.quantity} — ${formatPrice(order.amount)}`],
        button: { label: "Открыть в админке", url: `${env.appUrl}/admin/orders/${order.id}` },
      }),
    );
  }
}

// ─── файлы заказа ──────────────────────────────────────────────────────────

export type OrderFileKind = "block" | "cover" | "spec" | "reading";

const fileKey = (orderId: string, kind: OrderFileKind) => `orders/${orderId}/${kind === "spec" ? "spec.txt" : `${kind}.pdf`}`;

/** Генерирует (или берёт из кэша) файлы для типографии. */
export async function ensurePrintFiles(order: Order, force = false) {
  const keys = { block: fileKey(order.id, "block"), cover: fileKey(order.id, "cover"), spec: fileKey(order.id, "spec") };
  if (!force && (await fileExists(keys.block)) && (await fileExists(keys.cover)) && (await fileExists(keys.spec))) return keys;
  const bundle = await loadBookBundle(order.bookId);
  if (!bundle) throw new Error("Book not found");
  const pkg = await renderPrintPackage(bundle);
  await putFile(keys.block, pkg.interior);
  await putFile(keys.cover, pkg.cover);
  await putFile(keys.spec, Buffer.from(printSpecText(bundle, pkg, order.number), "utf8"));
  await db
    .update(orders)
    .set({
      printSpec: {
        format: bundle.book.format,
        pageCount: pkg.pageCount,
        spineMm: pkg.spineMm,
        coverWidthMm: pkg.coverWidthMm,
        coverHeightMm: pkg.coverHeightMm,
        generatedAt: new Date().toISOString(),
      },
    })
    .where(eq(orders.id, order.id));
  return keys;
}

export async function getOrderFile(order: Order, kind: OrderFileKind, force = false): Promise<Buffer> {
  if (kind === "reading") {
    const key = fileKey(order.id, "reading");
    if (!force && (await fileExists(key))) return getFile(key);
    const bundle = await loadBookBundle(order.bookId);
    if (!bundle) throw new Error("Book not found");
    const pdf = await renderReadingPdf(bundle);
    await putFile(key, pdf);
    return pdf;
  }
  const keys = await ensurePrintFiles(order, force);
  return getFile(keys[kind]);
}

export async function listUserOrders(userId: string) {
  return db.query.orders.findMany({ where: eq(orders.userId, userId), with: { book: true }, orderBy: desc(orders.createdAt) });
}

export function statusText(order: Order) {
  return orderStatusLabel(order.status);
}

