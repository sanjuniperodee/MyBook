"use server";

import { getLocale, getMessages, lredirect } from "@/i18n/server";
import { isLocale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { giftCards } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { plans, site } from "@/config/site";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { emailLayout, escapeHtml, sendMail } from "@/lib/mail";
import { newGiftToken, getGiftByToken, giftUrl } from "@/lib/gifts";
import { toIsoDay } from "@/lib/occasions";
import { formatPrice } from "@/config/site";
import { queueEvent } from "@/lib/track";

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
  if (!rateLimit(`gift:${await clientIp()}`, 10, 60 * 60_000)) return { error: e.tooMany };
  const parsed = schema(e).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const locale = isLocale(d.locale) ? d.locale : "ru";
  if (d.delivery === "email" && !d.recipientEmail) return { error: e.needEmail };
  if (d.sendAt && d.sendAt < toIsoDay(new Date())) return { error: e.pastDate };
  const plan = plans.find((p) => p.id === d.plan)!;
  const user = await getCurrentUser();
  const [gift] = await db
    .insert(giftCards)
    .values({
      token: newGiftToken(),
      plan: plan.id,
      amount: plan.price,
      currency: site.currency,
      paymentProvider: env.paymentProvider,
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
    })
    .returning();
  // Письмо покупателю — на языке сайта, где он оформлял (язык сертификата может быть другим).
  const buyerLocale = gift.buyerLocale;
  const buyer = messagesFor(buyerLocale);
  const t = buyer.gift.checkoutMail;
  await sendMail(
    gift.buyerEmail,
    t.subject(gift.number),
    emailLayout({
      locale: buyerLocale,
      title: t.title,
      paragraphs: [t.text(buyer.common.plans[plan.id].name, escapeHtml(gift.recipientName)), t.amount(formatPrice(gift.amount))],
      button: { label: t.button, url: giftUrl(gift, buyerLocale) },
    }),
  );
  await queueEvent("gift_checkout", gift.amount);
  return lredirect(`/gift/${gift.token}`);
}

/** Покупатель сообщил об оплате переводом. */
export async function claimGiftPaymentAction(token: string) {
  const gift = await getGiftByToken(token);
  if (!gift || gift.status !== "pending_payment" || gift.paymentClaimedAt) return;
  await db.update(giftCards).set({ paymentClaimedAt: new Date() }).where(eq(giftCards.id, gift.id));
  if (env.ordersNotifyEmail) {
    await sendMail(
      env.ordersNotifyEmail,
      `Проверьте оплату сертификата №${gift.number}`,
      emailLayout({ title: `Оплачен сертификат №${gift.number}?`, paragraphs: [`${escapeHtml(gift.buyerName)}, ${formatPrice(gift.amount)}. Проверьте поступление и подтвердите в админке.`], button: { label: "Сертификаты", url: `${env.appUrl}/admin/gifts` } }),
    );
  }
  return lredirect(`/gift/${gift.token}`);
}
