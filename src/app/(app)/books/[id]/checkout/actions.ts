"use server";

import { ApiClientError } from "@mybook/contracts";
import { z } from "zod";
import { getLocale, getMessages, lredirect } from "@/i18n/server";
import { requireUser } from "@/server/auth";
import { checkoutSchema } from "@/server/checkout";
import { queueEvent } from "@/server/track";
import { localCheckPromo, localPlaceOrder } from "@/server/v1-local-bridge-orders";
import { v1WebAction } from "@/server/v1-web-client";

export interface CheckoutState {
  error?: string;
}

export async function createOrderAction(_: CheckoutState, form: FormData): Promise<CheckoutState> {
  const user = await requireUser();
  const [locale, m] = await Promise.all([getLocale(), getMessages()]);
  // Проверка формы — общая с приложением (src/server/checkout.ts).
  const parsed = checkoutSchema(m.checkout.errors).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const outcome = await v1WebAction({
    section: "orders",
    locale,
    viaApi: async (api): Promise<{ ok: true; orderId: string; amount: number } | { ok: false; error: string }> => {
      try {
        const res = await api.webOrderPlace({
          body: {
            bookId: d.bookId,
            plan: d.plan,
            quantity: d.quantity,
            delivery: d.delivery ?? null,
            contactName: d.contactName,
            contactPhone: d.contactPhone,
            contactEmail: d.contactEmail,
            country: d.country || undefined,
            city: d.city || undefined,
            address: d.address || undefined,
            postalCode: d.postalCode || undefined,
            comment: d.comment || undefined,
            promoCode: d.promoCode || undefined,
            addons: d.addons || undefined,
            giftNote: d.giftNote || undefined,
            desiredDate: d.desiredDate || undefined,
            surprise: d.surprise === "on",
            agreementMode: d.agreementMode,
            upgradeFrom: d.upgradeFrom || undefined,
            consent: d.consent === "on",
            locale,
          },
        });
        return { ok: true, orderId: res.orderId, amount: res.amount };
      } catch (err) {
        if (err instanceof ApiClientError && [400, 403, 409, 429].includes(err.status)) {
          return { ok: false, error: err.message };
        }
        throw err;
      }
    },
    local: () => localPlaceOrder(user, locale, d),
  });
  if (!outcome.ok) return { error: outcome.error };
  // Событие для аналитики сайта (cookie браузера) — только у формы сайта.
  await queueEvent("order_created", outcome.amount);
  return lredirect(`/orders/${outcome.orderId}`);
}

export interface PromoPreview {
  ok: boolean;
  error?: string;
  code?: string;
  kind?: "percent" | "fixed";
  value?: number;
  label?: string;
}

/** Проверка промокода для предпросмотра скидки на странице оформления. */
export async function checkPromoAction(code: string): Promise<PromoPreview> {
  const user = await requireUser();
  const [locale, m] = await Promise.all([getLocale(), getMessages()]);
  const input = z.string().max(100).safeParse(code);
  if (!input.success) return { ok: false, error: m.checkout.promo.notFound };
  const res = await v1WebAction({
    section: "orders",
    locale,
    viaApi: (api) => api.webPromoCheck({ body: { code: input.data, locale } }),
    local: () => localCheckPromo(user.id, input.data, m),
  });
  return {
    ok: res.ok,
    ...(res.error ? { error: res.error } : {}),
    ...(res.code !== undefined ? { code: res.code } : {}),
    ...(res.kind !== undefined ? { kind: res.kind } : {}),
    ...(res.value !== undefined ? { value: res.value } : {}),
    ...(res.label !== undefined ? { label: res.label } : {}),
  };
}
