/**
 * Заказ и оплата для приложения «MyBooks»: те же функции, что страницы сайта (src/server/checkout.ts,
 * src/server/order-view.ts) и маршруты оплаты Kaspi, — без своей логики денег.
 */
import { messagesFor } from "@/i18n/messages";
import { OrderingError } from "@/modules/ordering";
import { apiBook, HttpError } from "@/server/api";
import { checkoutModel, checkoutQuote, checkoutSchema, placeOrder } from "@/server/checkout";
import { orderModel, ordersList, kaspiInvoice } from "@/server/order-view";
import { invoiceView } from "@/server/kaspi-view";
import { container } from "@/server/container";
import { rateLimit } from "@/server/rateLimit";
import { actionError } from "@/server/errors";
import type { User } from "@/shared/infrastructure/db/schema";
import type { Handlers } from "../app";

const localeOf = (u: User) => (u.locale === "kk" ? "kk" : "ru");

/** Заказ клиента: только свой (сотрудник смотрит заказы в CRM). */
async function ownOrder(orderId: string, userId: string) {
  const order = await container().ordering.queries.orderDetails(orderId);
  if (!order || order.userId !== userId) throw new HttpError(404, "notFound");
  return order;
}

export const cabinetOrderHandlers: Pick<Handlers, "cabinetCheckout" | "cabinetCheckoutQuote" | "cabinetOrderPlace" | "cabinetOrders" | "cabinetOrder" | "cabinetOrderKaspi" | "cabinetOrderKaspiStatus" | "cabinetOrderClaim" | "cabinetOrderCancel"> = {
  async cabinetCheckout({ req, user, input }) {
    const { book } = await apiBook(req, input.bookId);
    return checkoutModel(book, user!, localeOf(user!), messagesFor(localeOf(user!)));
  },

  async cabinetCheckoutQuote({ req, user, input }) {
    const { book } = await apiBook(req, input.bookId);
    const b = input.body;
    return checkoutQuote(book, user!.id, { plan: b.plan, quantity: b.quantity, delivery: b.delivery, addons: b.addons, promoCode: b.promoCode || null, mode: b.mode }, messagesFor(localeOf(user!)));
  },

  async cabinetOrderPlace({ req, user, input }) {
    const { book } = await apiBook(req, input.bookId);
    if (book.userId !== user!.id) throw new HttpError(403, "forbidden");
    const locale = localeOf(user!);
    const b = input.body;
    // Те же поля, что у формы сайта: проверка и тексты ошибок — checkoutSchema.
    const parsed = checkoutSchema(messagesFor(locale).checkout.errors).safeParse({
      bookId: book.id,
      plan: b.plan,
      quantity: b.quantity,
      delivery: b.delivery ?? undefined,
      contactName: b.contactName,
      contactPhone: b.contactPhone,
      contactEmail: b.contactEmail,
      country: b.country || undefined,
      city: b.city || undefined,
      address: b.address || undefined,
      postalCode: b.postalCode || undefined,
      comment: b.comment || undefined,
      promoCode: b.promoCode || undefined,
      addons: b.addons.join(","),
      giftNote: b.giftNote || undefined,
      desiredDate: b.desiredDate || "",
      surprise: b.surprise ? "on" : undefined,
      agreementMode: b.mode ?? undefined,
      consent: b.consent ? "on" : undefined,
    });
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message, code: "invalid" }, { status: 400 });
    try {
      const order = await placeOrder(user!, locale, parsed.data);
      return { orderId: order.id };
    } catch (err) {
      const error = await actionError(err, OrderingError);
      if (error === null) throw err;
      return Response.json({ error, code: "refused" }, { status: 400 });
    }
  },

  async cabinetOrders({ user }) {
    return ordersList(user!.id, localeOf(user!), messagesFor(localeOf(user!)));
  },

  async cabinetOrder({ user, input }) {
    const order = await ownOrder(input.orderId, user!.id);
    return orderModel(order, true, localeOf(user!), messagesFor(localeOf(user!)));
  },

  async cabinetOrderKaspi({ user, input }) {
    await ownOrder(input.orderId, user!.id);
    // Каждый счёт — уведомление в Kaspi клиента: не даём засыпать ими (как маршрут сайта).
    if (!(await rateLimit(`kaspi-invoice-user:${user!.id}`, 10, 10 * 60_000))) throw new HttpError(429, "kaspiRate");
    const invoice = await container().ordering.kaspi.payOrder(input.orderId, user!.id, { method: input.body.method, phone: input.body.phone });
    return { invoice: kaspiInvoice(await invoiceView(invoice)) };
  },

  async cabinetOrderKaspiStatus({ user, input }) {
    await ownOrder(input.orderId, user!.id);
    const invoice = await container().ordering.kaspi.status(input.invoiceId, { userId: user!.id });
    return { invoice: kaspiInvoice(await invoiceView(invoice)) };
  },

  async cabinetOrderClaim({ user, input }) {
    await container().ordering.orders.claimPayment(input.orderId, user!.id);
    return { ok: true };
  },

  async cabinetOrderCancel({ user, input }) {
    await container().ordering.orders.cancelByCustomer(input.orderId, user!.id);
    return { ok: true };
  },
};
