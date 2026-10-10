"use server";

import { queueEvent } from "@/server/track";
import { getLocale, getMessages, lredirect } from "@/i18n/server";
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { deliveryOptions, getPlan, plans, type DeliveryId } from "@/config/site";
import { OrderingError } from "@/modules/ordering";
import { container } from "@/server/container";

export interface CheckoutState {
  error?: string;
}

type CheckoutErrors = Awaited<ReturnType<typeof getMessages>>["checkout"]["errors"];
const schema = (e: CheckoutErrors) =>
  z
    .object({
      bookId: z.string().uuid(),
      plan: z.enum(plans.map((p) => p.id) as [string, ...string[]]),
      quantity: z.coerce.number().int().min(1).max(20).default(1),
      delivery: z.string().optional(),
      contactName: z.string().trim().min(2, e.contactName).max(100),
      contactPhone: z
        .string()
        .trim()
        .regex(/^[+\d][\d\s()-]{9,20}$/, e.phone),
      contactEmail: z.string().trim().toLowerCase().email(e.email),
      city: z.string().trim().max(100).optional(),
      address: z.string().trim().max(300).optional(),
      postalCode: z.string().trim().max(20).optional(),
      comment: z.string().trim().max(1000).optional(),
      promoCode: z.string().trim().max(40).optional(),
      addons: z.string().max(100).optional(),
      giftNote: z.string().trim().max(500, e.giftNote).optional(),
      desiredDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .or(z.literal("")),
      surprise: z.literal("on").optional(),
      agreementMode: z.enum(["agreed", "advance"]).optional(),
      consent: z.literal("on", { message: e.consent }),
    })
    .superRefine((d, ctx) => {
      const plan = getPlan(d.plan);
      if (!plan?.printed) return;
      const del = deliveryOptions.find((o) => o.id === d.delivery);
      if (!del) ctx.addIssue({ code: "custom", message: e.delivery });
      if (del && del.id !== "pickup") {
        if (!d.city) ctx.addIssue({ code: "custom", message: e.city });
        if (!d.address || d.address.length < 5) ctx.addIssue({ code: "custom", message: e.address });
      }
    });

export async function createOrderAction(_: CheckoutState, form: FormData): Promise<CheckoutState> {
  const user = await requireUser();
  const [locale, m] = await Promise.all([getLocale(), getMessages()]);
  const e = m.checkout.errors;
  const parsed = schema(e).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const plan = getPlan(d.plan)!;
  let order;
  try {
    order = await container().ordering.orders.place({
      userId: user.id,
      userPhone: user.phone,
      locale,
      bookId: d.bookId,
      plan: plan.id,
      quantity: d.quantity,
      delivery: { method: plan.printed ? (d.delivery as DeliveryId) : null, city: d.city || null, address: d.address || null, postalCode: d.postalCode || null },
      addons: d.addons ? d.addons.split(",") : [],
      contact: { name: d.contactName, phone: d.contactPhone, email: d.contactEmail },
      promoCode: d.promoCode || undefined,
      customerComment: d.comment,
      giftNote: d.giftNote,
      desiredDate: d.desiredDate || undefined,
      surprise: d.surprise === "on",
      agreementMode: d.agreementMode,
    });
  } catch (err) {
    if (OrderingError.is(err)) return { error: orderingErrorText(err, m.checkout) };
    throw err;
  }
  await queueEvent("order_created", order.amount);
  return lredirect(`/orders/${order.id}`);
}

/** Код ошибки домена → текст на языке клиента. */
function orderingErrorText(err: OrderingError, t: Awaited<ReturnType<typeof getMessages>>["checkout"]) {
  if (err.code === "notReady") return err.message;
  if (err.code === "empty" || err.code === "notFound" || err.code === "expired" || err.code === "used" || err.code === "ownCode" || err.code === "firstOrderOnly") return t.promo[err.code];
  if (err.code === "bookNotFound" || err.code === "alreadyOrdered" || err.code === "promoGone") return t.errors[err.code];
  return t.errors.bookNotFound;
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
  const { clientIp, rateLimit } = await import("@/server/rateLimit");
  if (!await rateLimit(`promo:${await clientIp()}`, 20, 600_000)) return { ok: false, error: t.errors.tooMany };
  const check = await container().ordering.promos.check(code, user.id);
  if (!check.ok) return { ok: false, error: t.promo[check.error] };
  const { code: c, kind, value, label } = check.promo;
  return { ok: true, code: c, kind, value, label };
}
