/**
 * Заказы и деньги API v1 — один код на два процесса (ADR 0014, контекст 7A): mybook-api (apps/api/src/routes/*) и
 * бэкенд на Nest (apps/backend, через переходный слой legacy/). Вход и права проверяет вызывающий: mybook-api —
 * apiStaff/apiBook, Nest — SessionGuard, @Permissions и BookAccessGuard; здесь — только то, что делает маршрут.
 *
 * Здесь — маршруты клиента (кабинет приложения «MyBooks», веб: оформление, заказы, оплата по ссылке); маршруты CRM —
 * в crm-money.ts. Логика денег — те же функции, что страницы сайта (checkout, order-view, v1-local-bridge-orders).
 */
import { isLocale, type Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { getLocale } from "@/i18n/server";
import { OrderingError } from "@/modules/ordering";
import { HttpError } from "@/server/api";
import { checkoutModel, checkoutQuote, checkoutSchema, placeOrder } from "@/server/checkout";
import { container } from "@/server/container";
import { actionError } from "@/server/errors";
import { invoiceView } from "@/server/kaspi-view";
import { kaspiInvoice, orderModel, ordersList } from "@/server/order-view";
import { rateLimit, trustedClientIp } from "@/server/rateLimit";
import {
  localCheckoutPageDto,
  localCheckPromo,
  localOrderDetailDto,
  localOrdersListDto,
  localPayClaim,
  localPayPageDto,
  localPayViewed,
  localPlaceOrder,
} from "@/server/v1-local-bridge-orders";
import type { User } from "@/shared/infrastructure/db/schema";
import { crmMoneyApi } from "./crm-money";
import type { OrdersApiHandlers, OrdersApiRoute } from "./types";

export { ORDERS_API_ROUTES, refused, type OrdersApiCall, type OrdersApiRoute } from "./types";
export { ORDERS_API_PERMISSIONS } from "./crm-money";

const localeOf = (u: User) => (u.locale === "kk" ? "kk" : "ru");

async function resolveLocale(raw?: string): Promise<Locale> {
  if (isLocale(raw)) return raw;
  const fromReq = await getLocale();
  return isLocale(fromReq) ? fromReq : "ru";
}

/** Заказ клиента: только свой (сотрудник смотрит заказы в CRM). */
async function ownOrder(orderId: string, userId: string) {
  const order = await container().ordering.queries.orderDetails(orderId);
  if (!order || order.userId !== userId) throw new HttpError(404, "notFound");
  return order;
}

type ClientRoute = Exclude<OrdersApiRoute, keyof typeof crmMoneyApi>;

const clientOrdersApi: OrdersApiHandlers<ClientRoute> = {
  // ── Кабинет клиента (приложение «MyBooks»): оформление и оплата ─────────────────────────────────────────────

  async cabinetCheckout({ user, book }) {
    return checkoutModel(book!, user!, localeOf(user!), messagesFor(localeOf(user!)));
  },

  async cabinetCheckoutQuote({ user, book, input }) {
    const b = input.body;
    return checkoutQuote(book!, user!.id, { plan: b.plan, quantity: b.quantity, delivery: b.delivery, addons: b.addons, promoCode: b.promoCode || null, mode: b.mode }, messagesFor(localeOf(user!)));
  },

  async cabinetOrderPlace({ user, book, input }) {
    if (book!.userId !== user!.id) throw new HttpError(403, "forbidden");
    const locale = localeOf(user!);
    const b = input.body;
    // Те же поля, что у формы сайта: проверка и тексты ошибок — checkoutSchema.
    const parsed = checkoutSchema(messagesFor(locale).checkout.errors).safeParse({
      bookId: book!.id,
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

  // ── Веб: оформление, заказы, оплата по ссылке (section "orders") ─────────────────────────────────────────────

  async webCheckoutPage({ user, book, input }) {
    const locale = await resolveLocale(input.locale);
    return localCheckoutPageDto(book!, user!, locale, messagesFor(locale), { promo: input.promo, upgrade: input.upgrade });
  },

  async webPromoCheck({ user, input }) {
    const locale = await resolveLocale(input.body.locale);
    return localCheckPromo(user!.id, input.body.code, messagesFor(locale));
  },

  async webOrderPlace({ user, input }) {
    const locale = await resolveLocale(input.body.locale);
    const m = messagesFor(locale);
    const b = input.body;
    const parsed = checkoutSchema(m.checkout.errors).safeParse({
      bookId: b.bookId,
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
      addons: b.addons || undefined,
      giftNote: b.giftNote || undefined,
      desiredDate: b.desiredDate || "",
      surprise: b.surprise ? "on" : undefined,
      agreementMode: b.agreementMode,
      upgradeFrom: b.upgradeFrom || "",
      consent: b.consent ? "on" : undefined,
    });
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message, code: "invalid" }, { status: 400 });
    const outcome = await localPlaceOrder(user!, locale, parsed.data);
    if (!outcome.ok) return Response.json({ error: outcome.error, code: outcome.code }, { status: 400 });
    return { orderId: outcome.orderId, amount: outcome.amount };
  },

  async webOrdersList({ user, input }) {
    const locale = await resolveLocale(input.locale);
    return localOrdersListDto(user!.id, locale);
  },

  async webOrderDetail({ user, input }) {
    const locale = await resolveLocale(input.locale);
    const detail = await localOrderDetailDto(input.orderId, user!, locale, messagesFor(locale));
    if (!detail) throw new HttpError(404, "orderNotFound");
    return detail;
  },

  async webPayPage({ input }) {
    const page = await localPayPageDto(input.token);
    if (!page) throw new HttpError(404, "invoiceNotFound");
    return page;
  },

  async webPayViewed({ user, input }) {
    if (user?.role === "admin") return { ok: true };
    return localPayViewed(input.token);
  },

  async webPayClaim({ input }) {
    const locale = await resolveLocale(input.body.locale);
    // Кнопку жмут по ссылке без входа: лимит не даёт перебирать токены (как в действии сайта).
    if (!(await rateLimit(`pay-claim:${await trustedClientIp()}`, 20, 600_000))) {
      return Response.json({ error: messagesFor(locale).common.errors.tooMany, code: "tooMany" }, { status: 429 });
    }
    const outcome = await localPayClaim(input.body.token);
    return { claimed: outcome.claimed, token: outcome.token };
  },
};

/** Все 46 маршрутов контекста 7A: клиентские (здесь) и CRM (crm-money.ts). */
export const ordersApi: OrdersApiHandlers<OrdersApiRoute> = { ...clientOrdersApi, ...crmMoneyApi };
