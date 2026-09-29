import "server-only";
import { randomBytes, randomInt } from "node:crypto";
import { and, eq, isNotNull, isNull, lte, or } from "drizzle-orm";
import { db } from "./db";
import { giftCards, promoCodes, type GiftCard, type PromoCode } from "./db/schema";
import { formatPrice, getPlan, site } from "@/config/site";
import { env } from "./env";
import { emailLayout, escapeHtml, sendMail } from "./mail";
import { humanDay, toIsoDay } from "./occasions";

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

export function giftUrl(gift: Pick<GiftCard, "token">) {
  return `${env.appUrl}/gift/${gift.token}`;
}

export function redeemUrl(code: string) {
  return `${env.appUrl}/redeem?code=${encodeURIComponent(code)}`;
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
  if (!gift.promo) throw new Error("Сертификат ещё не оплачен");
  return giftPdf(gift, gift.promo);
}

/**
 * Подтверждение оплаты: выпускаем одноразовый промокод на сумму сертификата,
 * отправляем покупателю PDF, а получателю — письмо (сразу или в выбранный день).
 */
export async function markGiftPaid(giftId: string, actor: string, paymentId?: string) {
  const gift = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(giftCards).where(eq(giftCards.id, giftId)).for("update");
    if (!current) throw new Error("Сертификат не найден");
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
    if (!promo) throw new Error("Не удалось выпустить код сертификата");
    const [row] = await tx
      .update(giftCards)
      .set({ status: "paid", paidAt: new Date(), promoCodeId: promo.id, ...(paymentId ? { paymentId } : {}) })
      .where(eq(giftCards.id, giftId))
      .returning();
    return { ...row, promo };
  });
  if (!gift) return;
  const pdf = await giftPdf(gift, gift.promo);
  const plan = getPlan(gift.plan);
  const later = gift.recipientEmail && gift.sendAt && gift.sendAt > toIsoDay(new Date());
  await sendMail(
    gift.buyerEmail,
    `Подарочный сертификат №${gift.number} готов`,
    emailLayout({
      title: "Сертификат готов",
      paragraphs: [
        `Спасибо! Сертификат на книгу «${escapeHtml(plan?.name ?? gift.plan)}» оплачен. Получатель: ${escapeHtml(gift.recipientName)}.`,
        `Код: <b style="letter-spacing:1px">${gift.promo.code}</b>. PDF для печати — во вложении.`,
        gift.recipientEmail
          ? later
            ? `Мы отправим сертификат на ${escapeHtml(gift.recipientEmail)} ${humanDay(gift.sendAt!)}.`
            : `Мы уже отправили сертификат на ${escapeHtml(gift.recipientEmail)}.`
          : "Распечатайте сертификат или перешлите PDF — как вам удобнее вручить подарок.",
      ],
      button: { label: "Открыть сертификат", url: giftUrl(gift) },
    }),
    [{ filename: `mybook-gift-${gift.number}.pdf`, content: pdf, contentType: "application/pdf" }],
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
  const plan = getPlan(gift.plan);
  await sendMail(
    gift.recipientEmail,
    `${gift.buyerName} дарит вам книгу`,
    emailLayout({
      title: `${escapeHtml(gift.recipientName)}, это подарок для вас`,
      paragraphs: [
        `${escapeHtml(gift.buyerName)} дарит вам сертификат ${site.name} — книгу «${escapeHtml(plan?.name ?? gift.plan)}», которую вы напишете сами: ответите на тёплые вопросы, добавите фотографии, а мы сверстаем и напечатаем её как настоящее издание.`,
        gift.message ? `<i>«${escapeHtml(gift.message)}»</i>` : "",
        `Ваш код: <b style="letter-spacing:1px">${gift.promo.code}</b>`,
      ].filter(Boolean),
      button: { label: "Начать книгу", url: redeemUrl(gift.promo.code) },
      footnote: "Сертификат действует год. Писать можно в своём темпе — всё сохраняется автоматически.",
    }),
    [{ filename: "podarochnyj-sertifikat.pdf", content: file, contentType: "application/pdf" }],
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
