"use server";

import { redirect } from "next/navigation";
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

const schema = z.object({
  plan: z.enum(["digital", "hardcover", "premium"]),
  buyerName: z.string().trim().min(1, "Как вас зовут?").max(60),
  buyerEmail: z.string().trim().toLowerCase().email("Проверьте e-mail — на него придёт сертификат"),
  buyerPhone: z.string().trim().max(30).optional().default(""),
  recipientName: z.string().trim().min(1, "Кому дарите?").max(60),
  delivery: z.enum(["me", "email"]),
  recipientEmail: z.string().trim().toLowerCase().email("Проверьте e-mail получателя").optional().or(z.literal("")),
  sendAt: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
  message: z.string().trim().max(400).optional().default(""),
  consent: z.literal("on", { message: "Нужно согласие с условиями оферты" }),
});

export async function createGiftAction(_: GiftFormState, form: FormData): Promise<GiftFormState> {
  if (!rateLimit(`gift:${await clientIp()}`, 10, 60 * 60_000)) return { error: "Слишком много попыток. Попробуйте позже." };
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  if (d.delivery === "email" && !d.recipientEmail) return { error: "Укажите e-mail получателя или выберите «Вручу сам(а)»" };
  if (d.sendAt && d.sendAt < toIsoDay(new Date())) return { error: "Дата отправки уже прошла" };
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
    })
    .returning();
  await sendMail(
    gift.buyerEmail,
    `Сертификат №${gift.number} — осталось оплатить`,
    emailLayout({
      title: "Сертификат почти готов",
      paragraphs: [`Сертификат на книгу «${plan.name}», получатель: ${escapeHtml(gift.recipientName)}.`, `Сумма к оплате: <b>${formatPrice(gift.amount)}</b>. После оплаты пришлём PDF с кодом.`],
      button: { label: "Перейти к оплате", url: giftUrl(gift) },
    }),
  );
  await queueEvent("gift_checkout", gift.amount);
  redirect(`/gift/${gift.token}`);
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
  redirect(`/gift/${gift.token}`);
}
