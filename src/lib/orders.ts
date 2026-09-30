import "server-only";
import { after } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "./db";
import { books, orderEvents, orders, users, type Order, type OrderStatus } from "./db/schema";
import { formatPrice, getPlan } from "@/config/site";
import { env } from "./env";
import { appLink, emailLayout, escapeHtml, sendMail } from "./mail";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { planName } from "@/i18n/labels";
import { orderStatusLabel } from "./orders-shared";
import { fileExists, getFile, putFile } from "./storage";
import { releasePromo } from "./promo";
import { dedupe, withRenderSlot } from "./pdf/queue";
import { loadBookBundle, printSpecText, renderPrintPackage, renderReadingPdf } from "./pdf/render";

export { calculatePrice, type PriceBreakdown } from "./pricing";

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

function orderUrl(order: Order, locale: Locale = "ru") {
  return appLink(`/orders/${order.id}`, locale);
}

/** Язык писем клиенту — из его профиля. */
async function customerLocale(order: Pick<Order, "userId">): Promise<Locale> {
  const [u] = await db.select({ locale: users.locale }).from(users).where(eq(users.id, order.userId)).limit(1);
  return u?.locale ?? "ru";
}

/** Смена статуса заказа + журнал + письмо клиенту. */
export async function setOrderStatus(orderId: string, status: OrderStatus, actor: string, note = "", extra: Partial<Order> = {}) {
  const before = await db.query.orders.findFirst({ where: eq(orders.id, orderId), columns: { status: true, promoCode: true } });
  const [order] = await db
    .update(orders)
    .set({ status, ...(status === "paid" ? { paidAt: new Date() } : {}), ...extra })
    .where(eq(orders.id, orderId))
    .returning();
  if (!order) throw new Error("Order not found");
  await addOrderEvent(orderId, status, note, actor);
  if (status === "cancelled" && before?.status === "pending_payment" && order.promoCode) {
    await releasePromo(order.promoCode);
  }
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
  // Готовим файлы заранее, чтобы клиент и типография скачивали их мгновенно.
  runInBackground(async () => {
    await ensurePrintFiles(order);
    await getOrderFile(order, "reading");
  });
  if (env.ordersNotifyEmail) {
    await sendMail(
      env.ordersNotifyEmail,
      `Оплачен заказ №${order.number}`,
      emailLayout({ title: `Заказ №${order.number} оплачен`, paragraphs: [`Сумма: ${formatPrice(order.amount)}`, `Тариф: ${planName(order.plan)}`], button: { label: "Открыть в админке", url: `${env.appUrl}/admin/orders/${order.id}` } }),
    );
  }
  return order;
}

function runInBackground(task: () => Promise<void>) {
  const job = () => task().catch((err) => console.error("[orders] background job failed", err));
  try {
    after(job);
  } catch {
    void job(); // вызов вне HTTP-запроса (скрипты)
  }
}

async function notifyCustomer(order: Order, status: OrderStatus) {
  const plan = getPlan(order.plan);
  const locale = await customerLocale(order);
  const m = messagesFor(locale).mail.order;
  const button = { label: m.open, url: orderUrl(order, locale) };
  const send = (title: string, paragraphs: string[]) => sendMail(order.contactEmail, m.subject(title, order.number), emailLayout({ locale, title, paragraphs, button }));
  switch (status) {
    case "paid":
      return send(m.paid.title, [m.paid.text(order.number, formatPrice(order.amount)), plan?.printed ? m.paid.printed : m.paid.digital]);
    case "in_production":
      return send(m.production.title, [m.production.text]);
    case "shipped":
      return send(m.shipped.title, [m.shipped.text, order.trackingNumber ? m.shipped.tracking(escapeHtml(order.trackingNumber)) : ""].filter(Boolean));
    case "delivered":
      return send(m.delivered.title, [m.delivered.text]);
    case "cancelled":
      return send(m.cancelled.title, [m.cancelled.text]);
    default:
      return;
  }
}

export async function notifyNewOrder(order: Order) {
  const locale = await customerLocale(order);
  const m = messagesFor(locale).mail.order.created;
  await sendMail(
    order.contactEmail,
    m.subject(order.number),
    emailLayout({
      locale,
      title: m.title,
      paragraphs: [m.number(order.number), m.plan(planName(order.plan, locale), order.quantity), m.amount(formatPrice(order.amount))],
      button: { label: m.button, url: orderUrl(order, locale) },
    }),
  );
  if (env.ordersNotifyEmail) {
    await sendMail(
      env.ordersNotifyEmail,
      `Новый заказ №${order.number}`,
      emailLayout({
        title: `Новый заказ №${order.number}`,
        paragraphs: [`${escapeHtml(order.contactName)}, ${escapeHtml(order.contactPhone)}`, `${planName(order.plan)} × ${order.quantity} — ${formatPrice(order.amount)}`],
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
  return dedupe(`print:${order.id}`, () => withRenderSlot(() => generatePrintFiles(order, keys)));
}

async function generatePrintFiles(order: Order, keys: { block: string; cover: string; spec: string }) {
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
    return dedupe(`reading:${order.id}`, () =>
      withRenderSlot(async () => {
        const bundle = await loadBookBundle(order.bookId);
        if (!bundle) throw new Error("Book not found");
        const pdf = await renderReadingPdf(bundle);
        await putFile(key, pdf);
        return pdf;
      }),
    );
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

