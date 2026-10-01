"use server";

import { getLocale, getMessages, lredirect } from "@/i18n/server";
import { isLocale } from "@/i18n/config";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth";
import { clientIp, rateLimit } from "@/server/rateLimit";
import { toIsoDay } from "@/lib/occasions";
import { queueEvent } from "@/server/track";
import { OrderingError } from "@/modules/ordering";
import { container } from "@/server/container";

export interface GiftFormState {
  error?: string;
}

type GiftErrors = Awaited<ReturnType<typeof getMessages>>["gift"]["form"]["errors"];
const schema = (e: GiftErrors) =>
  z.object({
    plan: z.enum(["digital", "hardcover", "premium"]),
    buyerName: z.string().trim().min(1, e.buyerName).max(60),
    buyerEmail: z.string().trim().toLowerCase().email(e.buyerEmail),
    buyerPhone: z.string().trim().max(30).optional().default(""),
    recipientName: z.string().trim().min(1, e.recipientName).max(60),
    delivery: z.enum(["me", "email"]),
    recipientEmail: z.string().trim().toLowerCase().email(e.recipientEmail).optional().or(z.literal("")),
    sendAt: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
    message: z.string().trim().max(400).optional().default(""),
    locale: z.string().refine(isLocale).default("ru"),
    consent: z.literal("on", { message: e.consent }),
  });

export async function createGiftAction(_: GiftFormState, form: FormData): Promise<GiftFormState> {
  const e = (await getMessages()).gift.form.errors;
  if (!await rateLimit(`gift:${await clientIp()}`, 10, 60 * 60_000)) return { error: e.tooMany };
  const parsed = schema(e).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const locale = isLocale(d.locale) ? d.locale : "ru";
  if (d.delivery === "email" && !d.recipientEmail) return { error: e.needEmail };
  if (d.sendAt && d.sendAt < toIsoDay(new Date())) return { error: e.pastDate };
  const user = await getCurrentUser();
  let gift;
  try {
    gift = await container().ordering.gifts.purchase({
      plan: d.plan,
      buyerUserId: user?.id ?? null,
      buyerName: d.buyerName,
      buyerEmail: d.buyerEmail,
      buyerPhone: d.buyerPhone,
      recipientName: d.recipientName,
      recipientEmail: d.delivery === "email" ? d.recipientEmail || null : null,
      sendAt: d.delivery === "email" && d.sendAt ? d.sendAt : null,
      message: d.message,
      locale,
      buyerLocale: await getLocale(),
    });
  } catch (err) {
    if (OrderingError.is(err) && err.code === "giftPastDate") return { error: e.pastDate };
    throw err;
  }
  await queueEvent("gift_checkout", gift.amount);
  return lredirect(`/gift/${gift.token}`);
}

/** Покупатель сообщил об оплате переводом. */
export async function claimGiftPaymentAction(token: string) {
  const gift = await container().ordering.gifts.claimPayment(token);
  if (!gift) return;
  return lredirect(`/gift/${gift.token}`);
}
