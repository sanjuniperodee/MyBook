/**
 * API v1 — маркетинг в приложении CRM: промокоды (список с использованием и выручкой, новый, вкл/выкл), подарочные
 * сертификаты (ждут оплаты, выпущенные; «Оплачен» — с чеком, переотправка, отмена) и отзывы (модерация). Данные и действия —
 * те же, что у страниц CRM (promoStats, recentGifts, feedback; createPromo/togglePromo, маршрут чека сертификата,
 * resendGift/cancelGift, moderateReview).
 */
import { z } from "zod";
import { route, schemas, uuid, type RouteDef } from "./core";
import { Done } from "./crm";

const int = z.number().int();

export const PromoRow = z
  .object({
    id: uuid,
    code: z.string(),
    /** «15%» или «5 000 ₸». */
    discount: z.string(),
    active: z.boolean(),
    used: int,
    maxUses: int.nullable(),
    until: z.string(),
    note: z.string(),
    paid: int,
    revenue: int,
  })
  .register(schemas, { id: "PromoRow" });

export const Promos = z
  .object({ rows: z.array(PromoRow), totals: z.object({ count: int, active: int, used: int, paid: int, revenue: int }) })
  .register(schemas, { id: "Promos" });

export const PromoBody = z
  .object({
    code: z.string().trim().min(3).max(40),
    kind: z.enum(["percent", "fixed"]),
    value: int.positive(),
    maxUses: int.positive().nullable().optional(),
    /** YYYY-MM-DD; нет — бессрочно. */
    expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    note: z.string().trim().max(200).optional(),
  })
  .strict()
  .register(schemas, { id: "PromoBody" });

export const GiftRow = z
  .object({
    id: uuid,
    number: int,
    status: z.enum(["pending_payment", "paid", "cancelled"]),
    statusLabel: z.string(),
    amount: int,
    plan: z.string(),
    buyer: z.string(),
    buyerContact: z.string(),
    recipient: z.string(),
    delivery: z.string(),
    createdLabel: z.string(),
    /** Покупатель сообщил об оплате переводом — проверьте чек. */
    claimed: z.boolean(),
    code: z.string().nullable(),
    redeemed: z.boolean(),
    canResend: z.boolean(),
    receiptUrl: z.string().nullable(),
  })
  .register(schemas, { id: "GiftRow" });

export const Gifts = z
  .object({ waiting: z.array(GiftRow), register: z.array(GiftRow), totals: z.object({ paid: int, redeemed: int, revenue: int, claimed: int }) })
  .register(schemas, { id: "Gifts" });

export const ReviewRow = z
  .object({
    id: uuid,
    status: z.enum(["new", "published", "hidden"]),
    rating: int,
    text: z.string(),
    author: z.string(),
    city: z.string(),
    theme: z.string(),
    locale: z.string(),
    featured: z.boolean(),
    /** Нельзя показать на сайте: автор не разрешил или текст слишком короткий. */
    blocker: z.string().nullable(),
    photoUrl: z.string().nullable(),
    orderId: uuid.nullable(),
    orderNumber: int.nullable(),
    thankYouCode: z.string().nullable(),
    createdLabel: z.string(),
  })
  .register(schemas, { id: "ReviewRow" });

export const Reviews = z
  .object({ rows: z.array(ReviewRow), /** Сколько новых (ждут проверки), на сайте и скрытых. */
    counts: z.object({ waiting: int, published: int, hidden: int }), average: z.string(), filter: z.string() })
  .register(schemas, { id: "Reviews" });

// ─── Ссылки и каналы ─────────────────────────────────────────────────────────────────────────────────────────────

/** Канал привлечения за период: переходы, заявки, регистрации, начали книгу, продажи, выручка, реклама, стоимость заявки, ROMI. */
export const ChannelStat = z
  .object({
    key: z.string(),
    label: z.string(),
    clicks: int,
    leads: int,
    registrations: int,
    startedBook: int,
    sales: int,
    revenue: int,
    spend: int,
    /** Готовым текстом: «12,5%», «4 300 ₸», «+120%» или «—». */
    conversion: z.string(),
    costPerLead: z.string(),
    romi: z.string(),
  })
  .register(schemas, { id: "ChannelStat" });

export const MarketingLink = z
  .object({
    id: uuid,
    name: z.string(),
    slug: z.string(),
    shortUrl: z.string(),
    /** Куда ведёт: страница сайта или «в WhatsApp». */
    target: z.string(),
    fullUrl: z.string(),
    archived: z.boolean(),
    createdLabel: z.string(),
    clicks: int,
    leads: int,
    registrations: int,
    sales: int,
    revenue: int,
  })
  .register(schemas, { id: "MarketingLink" });

export const MarketingReport = z
  .object({
    /** Период в днях: 7, 30, 90; 0 — всё время. */
    period: int,
    total: ChannelStat,
    channels: z.array(ChannelStat),
    links: z.array(MarketingLink),
    archived: z.boolean(),
    showAnalytics: z.boolean(),
    canManage: z.boolean(),
    pages: z.array(z.object({ path: z.string(), label: z.string() })),
  })
  .register(schemas, { id: "MarketingReport" });

export const MarketingLinkBody = z
  .object({
    name: z.string().trim().min(2).max(80),
    kind: z.enum(["site", "whatsapp"]),
    targetPath: z.string().trim().max(200).default("/"),
    waText: z.string().trim().max(300).default(""),
    utmSource: z.string().trim().min(1).max(60),
    utmMedium: z.string().trim().max(60).default(""),
    utmCampaign: z.string().trim().max(60).default(""),
    utmContent: z.string().trim().max(60).default(""),
  })
  .strict()
  .register(schemas, { id: "MarketingLinkBody" });

// ─── ИИ-дизайнер ─────────────────────────────────────────────────────────────────────────────────────────────────

export const DesignAiReport = z
  .object({
    days: int,
    enabled: z.boolean(),
    freeLimit: int,
    canEdit: z.boolean(),
    totals: z.object({ ok: int, failed: int, users: int, free: int, credit: int, costUsd: z.number(), avgSeconds: z.number().nullable() }),
    people: z.object({ used: int, hitLimit: int, withCredits: int, creditsLeft: int }),
    purchases: z.object({ paid: int, paidAmount: int, pending: int, pendingAmount: int }),
    byMode: z.array(z.object({ key: z.string(), label: z.string(), requests: int, costUsd: z.number() })),
    byDay: z.array(z.object({ day: z.string(), requests: int, users: int })),
    users: z.array(z.object({ userId: uuid, name: z.string(), email: z.string(), requests: int, free: int, credit: int, credits: int, lastLabel: z.string() })),
  })
  .register(schemas, { id: "DesignAiReport" });

export const DesignAiGrantBody = z.object({ userId: uuid, count: int.min(1).max(1000) }).strict().register(schemas, { id: "DesignAiGrantBody" });
export const DesignAiLimitBody = z.object({ limit: int.min(0).max(1000) }).strict().register(schemas, { id: "DesignAiLimitBody" });

export const ArchiveBody = z.object({ archived: z.boolean() }).strict().register(schemas, { id: "ArchiveBody" });

const IdParams = z.object({ id: uuid });

export const crmMarketingRoutes = {
  crmPromos: route({ method: "GET", path: "/api/v1/crm/promos", auth: "staff", tag: "crm", summary: "Промокоды: использование, оплаченные заказы, выручка", response: Promos }),
  crmPromoCreate: route({ method: "POST", path: "/api/v1/crm/promos", auth: "staff", tag: "crm", summary: "Новый промокод", body: PromoBody, response: Done }),
  crmPromoToggle: route({ method: "POST", path: "/api/v1/crm/promos/{id}/toggle", auth: "staff", tag: "crm", summary: "Включить или выключить промокод", params: IdParams, response: Done }),
  crmGifts: route({ method: "GET", path: "/api/v1/crm/gifts", auth: "staff", tag: "crm", summary: "Сертификаты: ждут оплаты и выпущенные", response: Gifts }),
  crmGiftPaid: route({ method: "POST", path: "/api/v1/crm/gifts/{id}/paid", auth: "staff", tag: "crm", summary: "«Оплачен» с чеком перевода (multipart, поле file)", params: IdParams, files: { field: "file" }, response: Done }),
  crmGiftResend: route({ method: "POST", path: "/api/v1/crm/gifts/{id}/resend", auth: "staff", tag: "crm", summary: "Отправить сертификат получателю ещё раз", params: IdParams, response: Done }),
  crmGiftCancel: route({ method: "POST", path: "/api/v1/crm/gifts/{id}/cancel", auth: "staff", tag: "crm", summary: "Отменить сертификат", params: IdParams, response: Done }),
  crmReviews: route({ method: "GET", path: "/api/v1/crm/reviews", auth: "staff", tag: "crm", summary: "Отзывы по статусу (new | published | hidden | all)", query: z.object({ s: z.enum(["new", "published", "hidden", "all"]).optional() }), response: Reviews }),
  crmReviewModerate: route({ method: "POST", path: "/api/v1/crm/reviews/{id}/{action}", auth: "staff", tag: "crm", summary: "Показать на сайте, скрыть, закрепить на главной или открепить", params: z.object({ id: uuid, action: z.enum(["publish", "hide", "feature", "unfeature"]) }), response: Done }),
  crmMarketing: route({ method: "GET", path: "/api/v1/crm/marketing", auth: "staff", tag: "crm", summary: "Ссылки и каналы: каналы за период и рекламные ссылки", query: z.object({ period: z.enum(["7", "30", "90", "0"]).optional(), archived: z.enum(["0", "1"]).optional() }), response: MarketingReport }),
  crmMarketingLinkCreate: route({ method: "POST", path: "/api/v1/crm/marketing/links", auth: "staff", tag: "crm", summary: "Новая рекламная ссылка (короткая, с UTM)", body: MarketingLinkBody, response: Done }),
  crmMarketingLinkArchive: route({ method: "POST", path: "/api/v1/crm/marketing/links/{id}/archive", auth: "staff", tag: "crm", summary: "Убрать ссылку в архив или вернуть", params: IdParams, body: ArchiveBody, response: Done }),
  crmDesignAi: route({ method: "GET", path: "/api/v1/crm/design-ai", auth: "staff", tag: "crm", summary: "ИИ-дизайнер: запросы, люди, покупки, режимы, кто пользуется", query: z.object({ days: z.enum(["7", "30", "90", "0"]).optional() }), response: DesignAiReport }),
  crmDesignAiGrant: route({ method: "POST", path: "/api/v1/crm/design-ai/grant", auth: "staff", tag: "crm", summary: "Подарить клиенту запросы (на баланс, как купленные)", body: DesignAiGrantBody, response: Done }),
  crmDesignAiLimit: route({ method: "PUT", path: "/api/v1/crm/design-ai/limit", auth: "staff", tag: "crm", summary: "Бесплатный лимит запросов на клиента", body: DesignAiLimitBody, response: Done }),
} satisfies Record<string, RouteDef>;
