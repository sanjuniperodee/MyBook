import "server-only";
import { eq } from "drizzle-orm";
import { users } from "@/lib/db/schema";
import { rootDb } from "@/shared/infrastructure/database";
import { formatPrice, getPlan, site } from "@/config/site";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { planName } from "@/i18n/labels";
import { env } from "@/lib/env";
import { appLink, emailLayout, escapeHtml, sendMail } from "@/lib/mail";
import { parseDay, toIsoDay } from "@/lib/occasions";
import type { GiftCardPaid, GiftCardPurchased, GiftPaymentClaimed, OrderCancelled, OrderPaid, OrderPlaced, OrderStatusChanged, PaymentClaimed } from "../../domain";
import type { GiftsService } from "../../application";
import type { DrizzleOrderingQueries, GiftView } from "../persistence/DrizzleOrderingQueries";

const orderUrl = (orderId: string, locale: Locale = "ru") => appLink(`/orders/${orderId}`, locale);
export const giftUrl = (token: string, locale: Locale = "ru") => appLink(`/gift/${token}`, locale);
export const redeemUrl = (code: string, locale: Locale = "ru") => appLink(`/redeem?code=${encodeURIComponent(code)}`, locale);

/**
 * Письма контекста заказов. Подписчик доменных событий: клиенту — на его языке,
 * магазину (ORDERS_NOTIFY_EMAIL) — по-русски.
 */
export class OrderingMailer {
  constructor(
    private readonly queries: DrizzleOrderingQueries,
    private readonly gifts: GiftsService,
  ) {}

  private async customerLocale(userId: string): Promise<Locale> {
    const [u] = await rootDb.select({ locale: users.locale }).from(users).where(eq(users.id, userId)).limit(1);
    return u?.locale ?? "ru";
  }

  private shop(subject: string, title: string, paragraphs: string[], button: { label: string; url: string }) {
    if (!env.ordersNotifyEmail) return;
    return sendMail(env.ordersNotifyEmail, subject, emailLayout({ title, paragraphs, button }));
  }

  // ─── заказы ──────────────────────────────────────────────────────────────

  onOrderPlaced = async (e: OrderPlaced) => {
    const p = e.payload;
    const order = await this.queries.orderDetails(p.orderId);
    if (!order) return;
    const locale = await this.customerLocale(p.userId);
    const m = messagesFor(locale).mail.order.created;
    await sendMail(
      order.contactEmail,
      m.subject(order.number),
      emailLayout({
        locale,
        title: m.title,
        paragraphs: [m.number(order.number), m.plan(planName(order.plan, locale), order.quantity), m.amount(formatPrice(order.amount))],
        button: { label: m.button, url: orderUrl(order.id, locale) },
      }),
    );
    await this.shop(`Новый заказ №${order.number}`, `Новый заказ №${order.number}`, [`${escapeHtml(order.contactName)}, ${escapeHtml(order.contactPhone)}`, `${planName(order.plan)} × ${order.quantity} — ${formatPrice(order.amount)}`], {
      label: "Открыть в админке",
      url: `${env.appUrl}/admin/orders/${order.id}`,
    });
  };

  onOrderPaid = async (e: OrderPaid) => {
    await this.customerStatusMail(e.payload.orderId, "paid");
    const p = e.payload;
    await this.shop(`Оплачен заказ №${p.number}`, `Заказ №${p.number} оплачен`, [`Сумма: ${formatPrice(p.amount)}`, `Тариф: ${planName(p.plan)}`], { label: "Открыть в админке", url: `${env.appUrl}/admin/orders/${p.orderId}` });
  };

  onStatusChanged = async (e: OrderStatusChanged) => {
    await this.customerStatusMail(e.payload.orderId, e.payload.to);
  };

  onOrderCancelled = async (e: OrderCancelled) => {
    await this.customerStatusMail(e.payload.orderId, "cancelled");
  };

  onPaymentClaimed = async (e: PaymentClaimed) => {
    const p = e.payload;
    await this.shop(`Проверьте оплату заказа №${p.number}`, `Клиент оплатил заказ №${p.number}`, ["Проверьте поступление и подтвердите оплату в админке."], { label: "Открыть заказ", url: `${env.appUrl}/admin/orders/${p.orderId}` });
  };

  private async customerStatusMail(orderId: string, status: string) {
    const order = await this.queries.orderDetails(orderId);
    if (!order) return;
    const plan = getPlan(order.plan);
    const locale = await this.customerLocale(order.userId);
    const m = messagesFor(locale).mail.order;
    const button = { label: m.open, url: orderUrl(order.id, locale) };
    const send = (title: string, paragraphs: string[]) => sendMail(order.contactEmail, m.subject(title, order.number), emailLayout({ locale, title, paragraphs, button }));
    switch (status) {
      case "paid":
        return send(m.paid.title, [m.paid.text(order.number, formatPrice(order.amount)), plan?.printed ? m.paid.printed : m.paid.digital]);
      case "in_production":
        return send(m.production.title, [m.production.text]);
      case "shipped":
        return send(m.shipped.title, [m.shipped.text, order.trackingNumber ? m.shipped.tracking(escapeHtml(order.trackingNumber)) : ""].filter(Boolean));
      case "delivered":
        return send(m.delivered.title, [m.delivered.text]);
      case "cancelled":
        return send(m.cancelled.title, [m.cancelled.text]);
    }
  }

  // ─── сертификаты ─────────────────────────────────────────────────────────

  onGiftPurchased = async (e: GiftCardPurchased) => {
    const gift = await this.queries.giftById(e.payload.giftId);
    if (!gift) return;
    // Письмо покупателю — на языке сайта, где он оформлял (язык сертификата может быть другим).
    const buyer = messagesFor(gift.buyerLocale);
    const t = buyer.gift.checkoutMail;
    const planKey = gift.plan as keyof typeof buyer.common.plans;
    await sendMail(
      gift.buyerEmail,
      t.subject(gift.number),
      emailLayout({
        locale: gift.buyerLocale,
        title: t.title,
        paragraphs: [t.text(buyer.common.plans[planKey]?.name ?? gift.plan, escapeHtml(gift.recipientName)), t.amount(formatPrice(gift.amount))],
        button: { label: t.button, url: giftUrl(gift.token, gift.buyerLocale) },
      }),
    );
  };

  onGiftPaymentClaimed = async (e: GiftPaymentClaimed) => {
    const gift = await this.queries.giftById(e.payload.giftId);
    if (!gift) return;
    await this.shop(`Проверьте оплату сертификата №${gift.number}`, `Оплачен сертификат №${gift.number}?`, [`${escapeHtml(gift.buyerName)}, ${formatPrice(gift.amount)}. Проверьте поступление и подтвердите в админке.`], { label: "Сертификаты", url: `${env.appUrl}/admin/gifts` });
  };

  /** Оплата сертификата: покупателю — PDF, получателю — письмо (сразу или в выбранный день), магазину — уведомление. */
  onGiftPaid = async (e: GiftCardPaid) => {
    const gift = await this.queries.giftById(e.payload.giftId);
    if (!gift?.promo) return;
    const pdf = await this.giftPdf(gift);
    const today = toIsoDay(new Date());
    const later = !!gift.recipientEmail && !!gift.sendAt && gift.sendAt > today;
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
          gift.recipientEmail ? (later ? t.later(escapeHtml(gift.recipientEmail), bm.common.date(parseDay(gift.sendAt!))) : t.sent(escapeHtml(gift.recipientEmail))) : t.print,
        ],
        button: { label: t.button, url: giftUrl(gift.token, gift.buyerLocale) },
      }),
      [{ filename: messagesFor(gift.locale).gift.card.filename(gift.number), content: pdf, contentType: "application/pdf" }],
    );
    if (gift.recipientEmail && !later) await this.sendToRecipient(gift, pdf);
    await this.shop(`Оплачен сертификат №${gift.number}`, `Сертификат №${gift.number} оплачен`, [`${escapeHtml(gift.buyerName)} → ${escapeHtml(gift.recipientName)}`, formatPrice(gift.amount)], { label: "Открыть в админке", url: `${env.appUrl}/admin/gifts` });
  };

  async giftPdf(gift: GiftView): Promise<Buffer> {
    if (!gift.promo) throw new Error("gift is not paid yet");
    const { renderGiftPdf } = await import("@/lib/pdf/gift");
    return renderGiftPdf({ locale: gift.locale, number: gift.number, code: gift.promo.code, plan: gift.plan, amount: gift.amount, buyerName: gift.buyerName, recipientName: gift.recipientName, message: gift.message, validUntil: gift.promo.expiresAt ?? new Date() });
  }

  async sendToRecipient(gift: GiftView, pdf?: Buffer) {
    if (!gift.recipientEmail || !gift.promo) return;
    const file = pdf ?? (await this.giftPdf(gift));
    const t = messagesFor(gift.locale).mail.gift.recipient;
    await sendMail(
      gift.recipientEmail,
      t.subject(gift.buyerName),
      emailLayout({
        locale: gift.locale,
        title: t.title(escapeHtml(gift.recipientName)),
        paragraphs: [t.text(escapeHtml(gift.buyerName), site.name, escapeHtml(planName(gift.plan, gift.locale))), gift.message ? `<i>«${escapeHtml(gift.message)}»</i>` : "", t.code(gift.promo.code)].filter(Boolean),
        button: { label: t.button, url: redeemUrl(gift.promo.code, gift.locale) },
        footnote: t.footnote,
      }),
      [{ filename: t.filename, content: file, contentType: "application/pdf" }],
    );
    await this.gifts.markSent(gift.id);
  }
}
