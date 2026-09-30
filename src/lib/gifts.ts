import "server-only";
import { randomBytes, randomInt } from "node:crypto";
import { and, eq, isNotNull, isNull, lte, or } from "drizzle-orm";
import { db } from "./db";
import { giftCards, promoCodes, type GiftCard, type PromoCode } from "./db/schema";
import { formatPrice, site } from "@/config/site";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { planName } from "@/i18n/labels";
import { env } from "./env";
import { appLink, emailLayout, escapeHtml, sendMail } from "./mail";
import { parseDay, toIsoDay } from "./occasions";

/** Cookie с кодом активированного сертификата — подставляется в оформление заказа. */
export const GIFT_COOKIE = "mb_gift";

/** Срок действия сертификата. */
export const GIFT_VALID_DAYS = 365;

/** Без похожих символов (0/O, 1/I/L), чтобы код легко продиктовать. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function generateGiftCode() {
  const part = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `GIFT-${part()}-${part()}`;
}

export function giftUrl(gift: Pick<GiftCard, "token">, locale: Locale = "ru") {
  return appLink(`/gift/${gift.token}`, locale);
}

export function redeemUrl(code: string, locale: Locale = "ru") {
  return appLink(`/redeem?code=${encodeURIComponent(code)}`, locale);
}

export function newGiftToken() {
  return randomBytes(18).toString("base64url");
}

export async function getGiftByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) return null;
  return db.query.giftCards.findFirst({ where: eq(giftCards.token, token), with: { promo: true } });
}

/** Сертификат, выпущенный под промокод (для страницы погашения и чекаута). */
export async function getGiftByPromo(promoId: string) {
  return db.query.giftCards.findFirst({ where: eq(giftCards.promoCodeId, promoId) });
}

async function giftPdf(gift: GiftCard, promo: PromoCode) {
  // Ленивый импорт: модуль планировщика не тянет за собой рендер PDF и шрифты.
  const { renderGiftPdf } = await import("./pdf/gift");
  return renderGiftPdf({
    locale: gift.locale,
    number: gift.number,
    code: promo.code,
    plan: gift.plan,
    amount: gift.amount,
    buyerName: gift.buyerName,
    recipientName: gift.recipientName,
    message: gift.message,
    validUntil: promo.expiresAt ?? new Date(),
  });
}

export async function getGiftPdf(gift: GiftCard & { promo: PromoCode | null }) {
  if (!gift.promo) throw new Error("gift is not paid yet");
  return giftPdf(gift, gift.promo);
}

/**
 * Подтверждение оплаты: выпускаем одноразовый промокод на сумму сертификата,
 * отправляем покупателю PDF, а получателю — письмо (сразу или в выбранный день).
 */
export async function markGiftPaid(giftId: string, actor: string, paymentId?: string) {
  const gift = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(giftCards).where(eq(giftCards.id, giftId)).for("update");
    if (!current) throw new Error("gift not found");
    if (current.status !== "pending_payment") return null;
    let promo: PromoCode | undefined;
    for (let i = 0; i < 5 && !promo; i++) {
      [promo] = await tx
        .insert(promoCodes)
        .values({
          code: generateGiftCode(),
          kind: "fixed",
          value: current.amount,
          maxUses: 1,
          expiresAt: new Date(Date.now() + GIFT_VALID_DAYS * 86_400_000),
          note: `Подарочный сертификат №${current.number} (${actor})`,
        })
        .onConflictDoNothing()
        .returning();
    }
    if (!promo) throw new Error("could not issue a gift code");
    const [row] = await tx
      .update(giftCards)
      .set({ status: "paid", paidAt: new Date(), promoCodeId: promo.id, ...(paymentId ? { paymentId } : {}) })
      .where(eq(giftCards.id, giftId))
      .returning();
    return { ...row, promo };
  });
  if (!gift) return;
  const pdf = await giftPdf(gift, gift.promo);
  const later = gift.recipientEmail && gift.sendAt && gift.sendAt > toIsoDay(new Date());
  // Покупателю — на его языке; сам сертификат (PDF) — на языке, выбранном для получателя.
  const bm = messagesFor(gift.buyerLocale);
  const t = bm.mail.gift.buyer;
  await sendMail(
    gift.buyerEmail,
    t.subject(gift.number),
    emailLayout({
      locale: gift.buyerLocale,
      title: t.title,
      paragraphs: [
        t.paid(escapeHtml(planName(gift.plan, gift.buyerLocale)), escapeHtml(gift.recipientName)),
        t.code(gift.promo.code),
        gift.recipientEmail
          ? later
            ? t.later(escapeHtml(gift.recipientEmail), bm.common.date(parseDay(gift.sendAt!)))
            : t.sent(escapeHtml(gift.recipientEmail))
          : t.print,
      ],
      button: { label: t.button, url: giftUrl(gift, gift.buyerLocale) },
    }),
    [{ filename: messagesFor(gift.locale).gift.card.filename(gift.number), content: pdf, contentType: "application/pdf" }],
  );
  if (gift.recipientEmail && !later) await sendGiftToRecipient(gift, pdf);
  if (env.ordersNotifyEmail) {
    await sendMail(
      env.ordersNotifyEmail,
      `Оплачен сертификат №${gift.number}`,
      emailLayout({ title: `Сертификат №${gift.number} оплачен`, paragraphs: [`${escapeHtml(gift.buyerName)} → ${escapeHtml(gift.recipientName)}`, formatPrice(gift.amount)], button: { label: "Открыть в админке", url: `${env.appUrl}/admin/gifts` } }),
    );
  }
}

export async function sendGiftToRecipient(gift: GiftCard & { promo: PromoCode }, pdf?: Buffer) {
  if (!gift.recipientEmail) return;
  const file = pdf ?? (await giftPdf(gift, gift.promo));
  const t = messagesFor(gift.locale).mail.gift.recipient;
  await sendMail(
    gift.recipientEmail,
    t.subject(gift.buyerName),
    emailLayout({
      locale: gift.locale,
      title: t.title(escapeHtml(gift.recipientName)),
      paragraphs: [
        t.text(escapeHtml(gift.buyerName), site.name, escapeHtml(planName(gift.plan, gift.locale))),
        gift.message ? `<i>«${escapeHtml(gift.message)}»</i>` : "",
        t.code(gift.promo.code),
      ].filter(Boolean),
      button: { label: t.button, url: redeemUrl(gift.promo.code, gift.locale) },
      footnote: t.footnote,
    }),
    [{ filename: t.filename, content: file, contentType: "application/pdf" }],
  );
  await db.update(giftCards).set({ sentAt: new Date() }).where(eq(giftCards.id, gift.id));
}

/** Отложенная отправка: вызывается планировщиком. */
export async function sendDueGifts(now = new Date()) {
  const due = await db.query.giftCards.findMany({
    where: and(eq(giftCards.status, "paid"), isNotNull(giftCards.recipientEmail), isNull(giftCards.sentAt), or(isNull(giftCards.sendAt), lte(giftCards.sendAt, toIsoDay(now)))),
    with: { promo: true },
    limit: 50,
  });
  for (const g of due) if (g.promo) await sendGiftToRecipient({ ...g, promo: g.promo });
  return due.length;
}
