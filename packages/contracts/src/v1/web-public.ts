/**
 * Публичные страницы сайта в API v1 (ADR 0012, A5 — Раздел 4, section: "public"): каталог и переключатели сайта,
 * подвал (виджет), витрина отзывов, приглашение друга, сертификат, активация кода, письмо близких по ссылке, отзыв
 * по ссылке из письма и отписка. Без входа: доступ даёт секрет в ссылке (токен, подпись) или код.
 */
import { z } from "zod";
import { Ok, iso, route, schemas, uuid, type RouteDef } from "./core";
import { WebLocale } from "./web-cabinet";
import { WebKaspiInvoiceView, WebPromoPreview } from "./web-orders";

const PlanIdSchema = z.enum(["digital", "hardcover", "premium"]);

/** Цены и тарифы из админки, переключатели сайта и реквизиты продавца — для сайта без БД (Vercel). */
export const WebSiteCatalog = z
  .object({
    /** Сырые переопределения каталога (crm_settings catalog.overrides); сайт сам прогоняет их через sanitizeOverrides. */
    overrides: z.record(z.string(), z.unknown()).nullable(),
    registration: z.boolean(),
    giftNote: z.boolean(),
    seller: z.object({ legalName: z.string(), bin: z.string(), phone: z.string(), whatsapp: z.string() }).partial(),
  })
  .register(schemas, { id: "WebSiteCatalog" });

export const WebSiteChrome = z
  .object({
    widget: z.object({ enabled: z.boolean(), chat: z.boolean(), whatsapp: z.string() }).nullable(),
    /** Номер WhatsApp магазина цифрами (кнопки «Написать в WhatsApp»). */
    shopWhatsappDigits: z.string(),
  })
  .register(schemas, { id: "WebSiteChrome" });

export const WebPublicReview = z
  .object({
    id: z.string(),
    rating: z.number().int(),
    text: z.string(),
    authorName: z.string(),
    city: z.string(),
    theme: z.string(),
    locale: z.string(),
    photo: z.object({ width: z.number(), height: z.number() }).nullable(),
    publishedAt: iso.nullable(),
  })
  .register(schemas, { id: "WebPublicReview" });

export const WebReviewsShowcase = z
  .object({
    reviews: z.array(WebPublicReview),
    summary: z.object({ count: z.number().int(), average: z.number() }).nullable(),
  })
  .register(schemas, { id: "WebReviewsShowcase" });

export const WebInviteWelcome = z
  .object({ welcome: z.object({ code: z.string(), percent: z.number(), from: z.string() }).nullable() })
  .register(schemas, { id: "WebInviteWelcome" });

export const WebGiftStatus = z
  .object({
    id: uuid,
    number: z.number().int(),
    token: z.string(),
    status: z.enum(["pending_payment", "paid", "cancelled"]),
    plan: PlanIdSchema,
    amount: z.number().int(),
    currency: z.string(),
    locale: WebLocale,
    buyerName: z.string(),
    buyerEmail: z.string(),
    recipientName: z.string(),
    recipientEmail: z.string().nullable(),
    message: z.string(),
    sendAt: z.string().nullable(),
    sentAt: iso.nullable(),
    paymentClaimedAt: iso.nullable(),
    /** Код сертификата — только у оплаченного. */
    promo: z.object({ code: z.string(), usedCount: z.number().int(), expiresAt: iso.nullable() }).nullable(),
    /** Ссылка активации для получателя (на языке сертификата) — только у оплаченного. */
    redeemUrl: z.string().nullable(),
    payment: z
      .object({
        online: z.object({ publicId: z.string() }).nullable(),
        manual: z.object({ title: z.string(), steps: z.array(z.string()) }).nullable(),
        kaspi: z.object({ initial: WebKaspiInvoiceView.nullable(), defaultPhone: z.string() }).nullable(),
      })
      .nullable(),
  })
  .register(schemas, { id: "WebGiftStatus" });

export const WebGiftCreateBody = z
  .object({
    plan: PlanIdSchema,
    buyerName: z.string().max(200),
    buyerEmail: z.string().max(320),
    buyerPhone: z.string().max(60),
    recipientName: z.string().max(200),
    recipientEmail: z.string().max(320).nullable(),
    sendAt: z.string().max(10).nullable(),
    message: z.string().max(1000),
    locale: WebLocale,
    buyerLocale: WebLocale,
  })
  .register(schemas, { id: "WebGiftCreateBody" });

export const WebGiftCreated = z
  .object({ ok: z.literal(true), token: z.string(), amount: z.number().int() })
  .or(z.object({ ok: z.literal(false), error: z.enum(["giftPastDate"]) }))
  .register(schemas, { id: "WebGiftCreated" });

export const WebGiftClaimResponse = z.object({ token: z.string().nullable() }).register(schemas, { id: "WebGiftClaimResponse" });

export const WebRedeemCheck = z
  .object({
    check: z.union([WebPromoPreview, z.object({ ok: z.literal(false), error: z.string() })]),
    gift: z.object({ locale: WebLocale, plan: PlanIdSchema, recipientName: z.string(), buyerName: z.string(), message: z.string() }).nullable(),
  })
  .register(schemas, { id: "WebRedeemCheck" });

export const WebLetterInvite = z
  .object({
    status: z.string(),
    theme: z.string(),
    title: z.string(),
    authorName: z.string(),
    recipientName: z.string(),
    inviteText: z.string(),
    coverTemplate: z.string(),
    coverLines: z.boolean(),
    format: z.string(),
  })
  .register(schemas, { id: "WebLetterInvite" });

export const WebReviewPage = z
  .object({
    number: z.number().int(),
    book: z.object({
      theme: z.string(),
      title: z.string(),
      coverTemplate: z.string(),
      coverLines: z.boolean(),
      format: z.string(),
      authorName: z.string(),
      recipientName: z.string(),
      hideRecipientOnCover: z.boolean(),
      namesOnCover: z.string(),
    }),
    /** null — отзыв пока оставить нельзя (книга не доставлена). */
    state: z
      .object({
        defaultName: z.string(),
        review: z
          .object({
            rating: z.number().int(),
            text: z.string(),
            authorName: z.string(),
            city: z.string(),
            consent: z.boolean(),
            hasPhoto: z.boolean(),
            status: z.enum(["new", "published", "hidden"]),
            thankYouCode: z.string().nullable(),
          })
          .nullable(),
      })
      .nullable(),
  })
  .register(schemas, { id: "WebReviewPage" });

export const WebUnsubscribeLink = z.object({ valid: z.boolean() }).register(schemas, { id: "WebUnsubscribeLink" });
const UnsubscribeBody = z.object({ u: z.string().max(200), t: z.string().max(200) }).register(schemas, { id: "WebUnsubscribeBody" });
const WebGiftClaimBody = z.object({ token: z.string().max(200) }).register(schemas, { id: "WebGiftClaimBody" });

/** Свой файл книги по ссылке из QR-кода (страница /v/<токен>): проигрыватель и подписи. */
export const WebAnswerFilePage = z
  .object({
    found: z
      .object({
        file: z.object({
          kind: z.enum(["video", "audio"]),
          status: z.string(),
          hasPoster: z.boolean(),
          width: z.number().nullable(),
          height: z.number().nullable(),
          durationSec: z.number().nullable(),
        }),
        bookTitle: z.string(),
        authorName: z.string(),
        caption: z.string(),
      })
      .nullable(),
  })
  .register(schemas, { id: "WebAnswerFilePage" });

/** Переход на рекламный лендинг (/skidka): заход или нажатие WhatsApp. Код и лендинг проверяет API (shared/domain/landing). */
const landingField = z.string().max(300).optional();
export const WebLandingVisitBody = z
  .object({
    code: z.string().min(1).max(20),
    landing: z.string().min(1).max(40),
    event: z.enum(["view", "click"]),
    utmSource: landingField,
    utmMedium: landingField,
    utmCampaign: landingField,
    utmContent: landingField,
    utmTerm: landingField,
    fbclid: landingField,
    /** Cookie Meta Pixel _fbp и _fbc — для будущей отправки событий через Conversions API. */
    fbp: landingField,
    fbc: landingField,
    campaignId: landingField,
    adsetId: landingField,
    adId: landingField,
    placement: landingField,
    referrer: landingField,
  })
  .register(schemas, { id: "WebLandingVisitBody" });

export const webPublicRoutes = {
  webAnswerFilePage: route({
    method: "GET",
    path: "/api/v1/web/answer-files/{token}",
    auth: "none",
    tag: "web-public",
    summary: "Свой файл книги по секретной ссылке из QR-кода: вид, готовность, размеры, книга и подпись",
    params: z.object({ token: z.string().min(10).max(80) }),
    response: WebAnswerFilePage,
  }),
  webSiteCatalog: route({
    method: "GET",
    path: "/api/v1/web/site/catalog",
    auth: "none",
    tag: "web-public",
    summary: "Цены и тарифы из админки, переключатели сайта и реквизиты продавца (сайт без БД подтягивает их каждые 10 с)",
    response: WebSiteCatalog,
  }),
  webSiteChrome: route({
    method: "GET",
    path: "/api/v1/web/site/chrome",
    auth: "none",
    tag: "web-public",
    summary: "Виджет связи в подвале и номер WhatsApp магазина",
    response: WebSiteChrome,
  }),
  webReviewsShowcase: route({
    method: "GET",
    path: "/api/v1/web/reviews/showcase",
    auth: "none",
    tag: "web-public",
    summary: "Витрина отзывов сайта (по теме книги) и сводная оценка",
    query: z.object({ limit: z.coerce.number().int().min(1).max(24).optional(), theme: z.string().max(60).optional() }),
    response: WebReviewsShowcase,
  }),
  webInviteWelcome: route({
    method: "GET",
    path: "/api/v1/web/invite/welcome",
    auth: "none",
    tag: "web-public",
    summary: "От кого приглашение и какая скидка (код из cookie приглашения)",
    query: z.object({ code: z.string().max(60) }),
    response: WebInviteWelcome,
  }),
  webGiftStatus: route({
    method: "GET",
    path: "/api/v1/web/gifts/{token}",
    auth: "none",
    tag: "web-public",
    summary: "Страница сертификата по секретной ссылке: состояние, код после оплаты, способы оплаты",
    params: z.object({ token: z.string().min(1).max(200) }),
    query: z.object({ locale: WebLocale.optional() }),
    response: WebGiftStatus,
  }),
  webGiftCreate: route({
    method: "POST",
    path: "/api/v1/web/gifts",
    auth: "none",
    tag: "web-public",
    summary: "Купить сертификат (форма уже проверена сайтом; покупатель может быть без аккаунта)",
    body: WebGiftCreateBody,
    response: WebGiftCreated,
  }),
  webGiftClaim: route({
    method: "POST",
    path: "/api/v1/web/gifts/claim",
    auth: "none",
    tag: "web-public",
    summary: "«Я оплатил(а)» переводом за сертификат (с лимитом по IP)",
    body: WebGiftClaimBody,
    response: WebGiftClaimResponse,
  }),
  webRedeemCheck: route({
    method: "GET",
    path: "/api/v1/web/redeem",
    auth: "none",
    tag: "web-public",
    summary: "Проверка кода сертификата или промокода на странице активации",
    query: z.object({ code: z.string().max(100) }),
    response: WebRedeemCheck,
  }),
  webLetterInvite: route({
    method: "GET",
    path: "/api/v1/web/letter-invite/{token}",
    auth: "none",
    tag: "web-public",
    summary: "Приглашение написать письмо в книгу по ссылке автора (без фото обложки)",
    params: z.object({ token: z.string().min(1).max(200) }),
    response: WebLetterInvite,
  }),
  webReviewPage: route({
    method: "GET",
    path: "/api/v1/web/review-page/{orderId}",
    auth: "none",
    tag: "web-public",
    summary: "Страница отзыва к заказу: по подписанной ссылке из письма или владельцу заказа",
    params: z.object({ orderId: uuid }),
    query: z.object({ t: z.string().max(300).optional() }),
    response: WebReviewPage,
  }),
  webUnsubscribeLink: route({
    method: "GET",
    path: "/api/v1/web/unsubscribe",
    auth: "none",
    tag: "web-public",
    summary: "Проверка подписи ссылки отписки из письма",
    query: z.object({ u: z.string().max(200).optional(), t: z.string().max(200).optional() }),
    response: WebUnsubscribeLink,
  }),
  webUnsubscribe: route({
    method: "POST",
    path: "/api/v1/web/unsubscribe",
    auth: "none",
    tag: "web-public",
    summary: "Отписаться от писем по подписанной ссылке",
    body: UnsubscribeBody,
    response: Ok,
  }),
  webLandingVisit: route({
    method: "POST",
    path: "/api/v1/web/landing-visits",
    auth: "none",
    tag: "web-public",
    summary: "Переход на рекламный лендинг: заход или нажатие WhatsApp (метки, fbclid, устройство) — для источника заявки в CRM",
    body: WebLandingVisitBody,
    response: Ok,
  }),
} as const satisfies Record<string, RouteDef>;
