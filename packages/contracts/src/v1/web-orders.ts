/**
 * Оформление заказа, заказы и оплата для веба в API v1 (ADR 0012, A5 — Раздел 3, section: "orders"):
 * маршруты для Next SSR/RSC и Server Actions без прямого доступа веба к БД.
 */
import { z } from "zod";
import { Ok, iso, route, schemas, uuid, type RouteDef } from "./core";
import { WebAgreementBook, WebDealAgreement, WebLocale } from "./web-cabinet";

const OrderStatusSchema = z.enum(["pending_payment", "paid", "in_production", "shipped", "delivered", "cancelled"]);
const OrderStatusToneSchema = z.enum(["warning", "success", "info", "accent", "neutral", "danger"]);
const AgreementGiftSchema = z.enum(["giftwrap", "delivery"]);
const PlanIdSchema = z.enum(["digital", "hardcover", "premium"]);
const DealInvoicePurposeSchema = z.enum(["prepayment", "remainder", "full", "custom"]);
const AccessStatusSchema = z.enum(["none", "due", "sent", "delivered", "failed", "needs_manager", "skipped"]);

export const WebPromoPreview = z
  .object({
    ok: z.literal(true),
    code: z.string(),
    kind: z.enum(["percent", "fixed"]),
    value: z.number(),
    label: z.string(),
  })
  .register(schemas, { id: "WebPromoPreview" });

export const WebCheckoutAgreement = z
  .object({
    dealNumber: z.number().int(),
    agreedTotal: z.number().int(),
    prepaid: z.number().int(),
    batch: z.object({ index: z.number().int(), size: z.number().int() }).nullable(),
    plan: PlanIdSchema.nullable(),
    gifts: z.array(AgreementGiftSchema),
  })
  .register(schemas, { id: "WebCheckoutAgreement" });

export const WebCheckoutUpgrade = z
  .object({
    orderId: uuid,
    number: z.number().int(),
    credit: z.number().int(),
  })
  .register(schemas, { id: "WebCheckoutUpgrade" });

export const WebCheckoutPhotoDim = z
  .object({
    id: uuid,
    width: z.number().int(),
    height: z.number().int(),
  })
  .register(schemas, { id: "WebCheckoutPhotoDim" });

export const WebCheckoutIssue = z
  .object({
    level: z.enum(["error", "warning"]),
    text: z.string(),
    href: z.string().nullable(),
  })
  .register(schemas, { id: "WebCheckoutIssue" });

export const WebCheckoutPageData = z
  .object({
    pageCount: z.number().int(),
    exactPages: z.boolean(),
    answered: z.number().int(),
    photosCount: z.number().int(),
    photos: z.array(WebCheckoutPhotoDim),
    issues: z.array(WebCheckoutIssue),
    blocked: z.boolean(),
    staffView: z.boolean(),
    initialPromo: WebPromoPreview.nullable(),
    initialPlan: PlanIdSchema.nullable(),
    upgrade: WebCheckoutUpgrade.nullable(),
    agreement: WebCheckoutAgreement.nullable(),
    defaults: z.object({
      name: z.string(),
      email: z.string(),
      phone: z.string(),
      desiredDate: z.string().nullable(),
      occasionLabel: z.string().nullable(),
    }),
  })
  .register(schemas, { id: "WebCheckoutPageData" });

export const WebCheckoutPageResponse = z
  .object({
    closed: z.boolean(),
    data: WebCheckoutPageData.nullable(),
  })
  .register(schemas, { id: "WebCheckoutPageResponse" });

export const WebPromoCheckBody = z
  .object({
    code: z.string().max(200),
    locale: WebLocale.optional(),
  })
  .strict()
  .register(schemas, { id: "WebPromoCheckBody" });

export const WebPromoCheckResponse = z
  .object({
    ok: z.boolean(),
    error: z.string().nullable().optional(),
    code: z.string().optional(),
    kind: z.enum(["percent", "fixed"]).optional(),
    value: z.number().optional(),
    label: z.string().optional(),
  })
  .register(schemas, { id: "WebPromoCheckResponse" });

export const WebOrderPlaceBody = z
  .object({
    bookId: uuid,
    plan: z.string().max(40),
    quantity: z.number().int().min(1).max(20),
    delivery: z.string().max(20).nullable().optional(),
    contactName: z.string().max(100),
    contactPhone: z.string().max(40),
    contactEmail: z.string().max(200),
    country: z.string().max(60).optional(),
    city: z.string().max(100).optional(),
    address: z.string().max(300).optional(),
    postalCode: z.string().max(20).optional(),
    comment: z.string().max(1000).optional(),
    promoCode: z.string().max(40).optional(),
    addons: z.string().max(100).optional(),
    giftNote: z.string().max(500).optional(),
    desiredDate: z.string().max(10).optional(),
    surprise: z.boolean().optional(),
    agreementMode: z.enum(["agreed", "advance"]).optional(),
    upgradeFrom: z.string().max(40).optional(),
    consent: z.boolean(),
    locale: WebLocale.optional(),
  })
  .strict()
  .register(schemas, { id: "WebOrderPlaceBody" });

export const WebOrderPlacedResponse = z
  .object({
    orderId: uuid,
    amount: z.number().int(),
  })
  .register(schemas, { id: "WebOrderPlacedResponse" });

export const WebOrderBookCover = z
  .object({
    id: uuid,
    title: z.string(),
    subtitle: z.string(),
    coverTemplate: z.string(),
    coverLines: z.boolean(),
    format: z.string(),
    theme: z.string(),
    authorName: z.string(),
    recipientName: z.string(),
    hideRecipientOnCover: z.boolean(),
    namesOnCover: z.string(),
    coverPhotoId: uuid.nullable(),
    coverPhotoExtra: z.array(z.string()).nullable(),
    coverDesign: z.record(z.string(), z.unknown()).nullable(),
  })
  .register(schemas, { id: "WebOrderBookCover" });

export const WebOrderListItem = z
  .object({
    id: uuid,
    number: z.number().int(),
    plan: z.string(),
    printed: z.boolean(),
    quantity: z.number().int(),
    amount: z.number().int(),
    status: OrderStatusSchema,
    statusLabel: z.string(),
    statusTone: OrderStatusToneSchema,
    createdAt: iso,
    book: WebOrderBookCover,
  })
  .register(schemas, { id: "WebOrderListItem" });

export const WebOrdersListResponse = z
  .object({
    orders: z.array(WebOrderListItem),
    agreement: WebDealAgreement.nullable(),
    agreementBooks: z.array(WebAgreementBook),
  })
  .register(schemas, { id: "WebOrdersListResponse" });

export const WebKaspiInvoiceView = z
  .object({
    id: z.string(),
    method: z.enum(["invoice", "qr"]),
    status: z.enum(["pending", "paid", "failed", "cancelled", "expired"]),
    amount: z.number().int(),
    phone: z.string().nullable(),
    link: z.string().nullable(),
    qrSvg: z.string().nullable(),
    expiresAt: iso.nullable(),
    paidAt: iso.nullable(),
  })
  .register(schemas, { id: "WebKaspiInvoiceView" });

export const WebOrderDetailOrder = z
  .object({
    id: uuid,
    number: z.number().int(),
    status: OrderStatusSchema,
    plan: z.string(),
    quantity: z.number().int(),
    currency: z.string(),
    itemsAmount: z.number().int(),
    discountAmount: z.number().int(),
    addonsAmount: z.number().int(),
    deliveryAmount: z.number().int(),
    prepaidAmount: z.number().int(),
    amount: z.number().int(),
    promoCode: z.string().nullable(),
    addons: z.array(z.string()),
    deliveryMethod: z.string().nullable(),
    deliveryCountry: z.string().nullable(),
    postalCode: z.string().nullable(),
    city: z.string().nullable(),
    address: z.string().nullable(),
    contactName: z.string(),
    contactPhone: z.string(),
    contactEmail: z.string(),
    giftNote: z.string().nullable(),
    desiredDate: z.string().nullable(),
    surprise: z.boolean(),
    customerComment: z.string().nullable(),
    trackingNumber: z.string().nullable(),
    paymentClaimedAt: iso.nullable(),
    createdAt: iso,
    book: WebOrderBookCover,
  })
  .register(schemas, { id: "WebOrderDetailOrder" });

export const WebOrderDetailResponse = z
  .object({
    own: z.boolean(),
    printed: z.boolean(),
    paid: z.boolean(),
    statusLabel: z.string(),
    statusTone: OrderStatusToneSchema,
    reviewable: z.boolean(),
    reviewThankYouPercent: z.number().int(),
    referral: z.object({
      friendPercent: z.number().int(),
      rewardPercent: z.number().int(),
    }),
    review: z
      .object({
        rating: z.number().int(),
        status: z.string(),
        thankYouCode: z.string().nullable(),
      })
      .nullable(),
    upgrade: z
      .object({
        bookId: uuid,
        orderId: uuid,
        number: z.number().int(),
        credit: z.number().int(),
      })
      .nullable(),
    payment: z
      .object({
        online: z.object({ publicId: z.string() }).nullable(),
        manual: z.object({ title: z.string(), steps: z.array(z.string()) }).nullable(),
        kaspi: z
          .object({
            initial: WebKaspiInvoiceView.nullable(),
            defaultPhone: z.string(),
          })
          .nullable(),
      })
      .nullable(),
    order: WebOrderDetailOrder,
  })
  .register(schemas, { id: "WebOrderDetailResponse" });

export const WebPayPageResponse = z
  .object({
    token: z.string(),
    number: z.number().int(),
    label: z.string(),
    state: z.enum(["paid", "ordered", "payable", "cancelled", "expired"]),
    viewed: z.boolean(),
    amount: z.number().int(),
    plan: z.string(),
    purpose: DealInvoicePurposeSchema,
    booksCount: z.number().int(),
    gifts: z.array(AgreementGiftSchema),
    expiresAt: iso,
    claimed: z.boolean(),
    accessStatus: AccessStatusSchema,
    seller: z.object({
      legalName: z.string(),
      bin: z.string(),
    }),
    online: z.object({ publicId: z.string() }).nullable(),
    transfer: z.object({ phone: z.string(), name: z.string() }).nullable(),
    kaspi: z
      .object({
        initial: WebKaspiInvoiceView.nullable(),
        defaultPhone: z.string(),
        maskedPhone: z.string().nullable(),
        recipient: z.string().nullable(),
        comment: z.string(),
      })
      .nullable(),
  })
  .register(schemas, { id: "WebPayPageResponse" });

export const WebPayClaimBody = z
  .object({
    token: z.string().max(200),
    locale: WebLocale.optional(),
  })
  .strict()
  .register(schemas, { id: "WebPayClaimBody" });

export const WebPayClaimResponse = z
  .object({
    claimed: z.boolean(),
    token: z.string().nullable(),
  })
  .register(schemas, { id: "WebPayClaimResponse" });

const LocaleQuery = z.object({ locale: WebLocale.optional() });
const CheckoutQuery = z.object({
  locale: WebLocale.optional(),
  promo: z.string().max(100).optional(),
  upgrade: z.string().max(100).optional(),
});

export const webOrdersRoutes = {
  webCheckoutPage: route({
    method: "GET",
    path: "/api/v1/web/books/{bookId}/checkout",
    auth: "user",
    tag: "web-orders",
    summary: "Данные страницы оформления заказа книги: готовность макета, промокод/сертификат, договорённость, дозаказ",
    params: z.object({ bookId: uuid }),
    query: CheckoutQuery,
    response: WebCheckoutPageResponse,
  }),
  webPromoCheck: route({
    method: "POST",
    path: "/api/v1/web/checkout/promo-check",
    auth: "user",
    tag: "web-orders",
    summary: "Проверка промокода или сертификата при оформлении заказа (с лимитом по IP)",
    body: WebPromoCheckBody,
    response: WebPromoCheckResponse,
  }),
  webOrderPlace: route({
    method: "POST",
    path: "/api/v1/web/orders",
    auth: "user",
    tag: "web-orders",
    summary: "Оформить заказ с сайта (поддержка всех языков веба, договорённостей и дозаказа печатной версии)",
    body: WebOrderPlaceBody,
    response: WebOrderPlacedResponse,
  }),
  webOrdersList: route({
    method: "GET",
    path: "/api/v1/web/orders",
    auth: "user",
    tag: "web-orders",
    summary: "Список заказов клиента для веба: заказы с полями обложки, договорённость и книги для карточки брони",
    query: LocaleQuery,
    response: WebOrdersListResponse,
  }),
  webOrderDetail: route({
    method: "GET",
    path: "/api/v1/web/orders/{orderId}",
    auth: "user",
    tag: "web-orders",
    summary: "Карточка заказа для веба (владелец или сотрудник с правом orders.view): детали, отзыв, дозаказ, оплата",
    params: z.object({ orderId: uuid }),
    query: LocaleQuery,
    response: WebOrderDetailResponse,
  }),
  webPayPage: route({
    method: "GET",
    path: "/api/v1/web/pay/{token}",
    auth: "none",
    tag: "web-orders",
    summary: "Страница оплаты счёта из чата по секретному токену (без входа и без контактов клиента)",
    params: z.object({ token: z.string().min(1).max(200) }),
    query: LocaleQuery,
    response: WebPayPageResponse,
  }),
  webPayViewed: route({
    method: "POST",
    path: "/api/v1/web/pay/{token}/viewed",
    auth: "none",
    tag: "web-orders",
    summary: "Отметить открытие счёта из чата клиентом (сделки-12)",
    params: z.object({ token: z.string().min(1).max(200) }),
    response: Ok,
  }),
  webPayClaim: route({
    method: "POST",
    path: "/api/v1/web/pay/claim",
    auth: "none",
    tag: "web-orders",
    summary: "«Я оплатил(а)» переводом по счёту из чата (с лимитом по IP)",
    body: WebPayClaimBody,
    response: WebPayClaimResponse,
  }),
} as const satisfies Record<string, RouteDef>;
