"use server";

import { getLocale, getMessages, lredirect } from "@/i18n/server";
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { checkoutSchema, placeOrder } from "@/server/checkout";
import { queueEvent } from "@/server/track";
import { OrderingError } from "@/modules/ordering";
import { container } from "@/server/container";
import { actionError } from "@/server/errors";

export interface CheckoutState {
  error?: string;
}

export async function createOrderAction(_: CheckoutState, form: FormData): Promise<CheckoutState> {
  const user = await requireUser();
  const [locale, m] = await Promise.all([getLocale(), getMessages()]);
  // Проверка формы и создание заказа — общие с приложением (src/server/checkout.ts).
  const parsed = checkoutSchema(m.checkout.errors).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  let order;
  try {
    order = await placeOrder(user, locale, parsed.data);
  } catch (err) {
    const error = await actionError(err, OrderingError);
    if (error === null) throw err;
    return { error };
  }
  // Событие для аналитики сайта (cookie браузера) — только у формы сайта.
  await queueEvent("order_created", order.amount);
  return lredirect(`/orders/${order.id}`);
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
  const t = (await getMessages()).checkout;
  const { trustedClientIp, rateLimit } = await import("@/server/rateLimit");
  if (!await rateLimit(`promo:${await trustedClientIp()}`, 20, 600_000)) return { ok: false, error: t.errors.tooMany };
  const input = z.string().max(100).safeParse(code);
  if (!input.success) return { ok: false, error: t.promo.notFound };
  const check = await container().ordering.promos.check(input.data, user.id);
  if (!check.ok) return { ok: false, error: t.promo[check.error] };
  const { code: c, kind, value, label } = check.promo;
  return { ok: true, code: c, kind, value, label };
}
