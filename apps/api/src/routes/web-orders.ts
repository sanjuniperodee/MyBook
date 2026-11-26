/**
 * Обработчики оформления заказа, заказов и оплаты для веба в API v1 (ADR 0012, Раздел 3, section: "orders").
 * Делегируют единым сборщикам `src/server/v1-local-bridge-orders.ts` и `src/server/checkout.ts`.
 */
import { isLocale, type Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { getLocale } from "@/i18n/server";
import { apiBook, HttpError } from "@/server/api";
import { getCurrentUser } from "@/server/auth";
import { rateLimit, trustedClientIp } from "@/server/rateLimit";
import { checkoutSchema } from "@/server/checkout";
import {
  localCheckPromo,
  localCheckoutPageDto,
  localOrderDetailDto,
  localOrdersListDto,
  localPayClaim,
  localPayPageDto,
  localPayViewed,
  localPlaceOrder,
} from "@/server/v1-local-bridge-orders";
import type { Handlers } from "../app";

async function resolveLocale(raw?: string): Promise<Locale> {
  if (isLocale(raw)) return raw;
  const fromReq = await getLocale();
  return isLocale(fromReq) ? fromReq : "ru";
}

export const webOrdersHandlers: Pick<
  Handlers,
  | "webCheckoutPage"
  | "webPromoCheck"
  | "webOrderPlace"
  | "webOrdersList"
  | "webOrderDetail"
  | "webPayPage"
  | "webPayViewed"
  | "webPayClaim"
> = {
  async webCheckoutPage({ req, user, input }) {
    const { book } = await apiBook(req, input.bookId);
    const locale = await resolveLocale(input.locale);
    return localCheckoutPageDto(book, user!, locale, messagesFor(locale), {
      promo: input.promo,
      upgrade: input.upgrade,
    });
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

  async webPayViewed({ input }) {
    const user = await getCurrentUser();
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
