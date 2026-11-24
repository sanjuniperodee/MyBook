/**
 * Заказ и оплата для приложения «MyBooks» (API v1): оформление (модель экрана, расчёт итога, создание заказа), мои
 * заказы, заказ (что сейчас, этапы, чек) и оплата через Kaspi Pay. Модели собирает сервер теми же функциями, что
 * страницы сайта (src/server/checkout.ts, src/server/order-view.ts), — правила цены не повторяются в приложении.
 */
import { z } from "zod";
import { schemas, type RouteDef } from "./core";

const uuid = z.uuid();

export const PriceLine = z.object({ label: z.string(), value: z.string(), tone: z.enum(["plain", "success", "muted"]) }).register(schemas, { id: "PriceLine" });

export const CheckoutAddon = z.object({ id: z.string(), name: z.string(), description: z.string(), priceLabel: z.string() }).register(schemas, { id: "CheckoutAddon" });
export const CheckoutPlan = z
  .object({ id: z.string(), name: z.string(), features: z.array(z.string()), price: z.number().int(), priceLabel: z.string(), printed: z.boolean(), extraCopy: z.string().nullable(), addons: z.array(CheckoutAddon) })
  .register(schemas, { id: "CheckoutPlan" });
export const CheckoutDelivery = z.object({ id: z.string(), name: z.string(), description: z.string(), priceLabel: z.string(), quoted: z.boolean(), abroad: z.boolean() }).register(schemas, { id: "CheckoutDelivery" });
export const CheckoutIssue = z.object({ level: z.enum(["error", "warning"]), text: z.string(), href: z.string().nullable() }).register(schemas, { id: "CheckoutIssue" });
export const CheckoutAgreement = z
  .object({
    title: z.string(),
    summary: z.string(),
    batch: z.string().nullable(),
    gifts: z.string().nullable(),
    modes: z.array(z.object({ id: z.string(), title: z.string(), hint: z.string() })),
    refund: z.string(),
    whatsapp: z.string(),
  })
  .register(schemas, { id: "CheckoutAgreement" });

/** Оформление заказа. closed — книгу уже заказали (orderId — открыть заказ). */
export const CabinetCheckout = z
  .object({
    closed: z.boolean(),
    orderId: z.string().nullable(),
    title: z.string().optional(),
    summary: z.string().optional(),
    design: z.array(z.string()).optional(),
    checkPreview: z.string().optional(),
    blocked: z.boolean().optional(),
    issues: z.array(CheckoutIssue).optional(),
    plans: z.array(CheckoutPlan).optional(),
    lockedPlan: z.string().nullable().optional(),
    deliveries: z.array(CheckoutDelivery).optional(),
    quotedNote: z.string().optional(),
    giftNote: z.boolean().optional(),
    occasionLabel: z.string().nullable().optional(),
    agreement: CheckoutAgreement.nullable().optional(),
    defaults: z.object({ name: z.string(), email: z.string(), phone: z.string(), desiredDate: z.string() }).optional(),
    offerUrl: z.string().optional(),
    privacyUrl: z.string().optional(),
  })
  .register(schemas, { id: "CabinetCheckout" });

export const CheckoutQuoteBody = z
  .object({
    plan: z.string().max(40),
    quantity: z.number().int().min(1).max(20),
    delivery: z.string().max(20).nullable(),
    addons: z.array(z.string().max(20)).max(10),
    promoCode: z.string().trim().max(40).nullable(),
    /** agreed | advance — режим договорённости; null — без договорённости. */
    mode: z.enum(["agreed", "advance"]).nullable(),
  })
  .register(schemas, { id: "CheckoutQuoteBody" });

export const CheckoutQuote = z
  .object({
    plan: z.string(),
    lines: z.array(PriceLine),
    totalLabel: z.string(),
    total: z.string(),
    quotedTotal: z.string().nullable(),
    promo: z.object({ ok: z.boolean(), text: z.string() }).nullable(),
  })
  .register(schemas, { id: "CheckoutQuote" });

/** Форма заказа — те же поля и правила, что у формы сайта (checkoutSchema). */
export const OrderPlaceBody = z
  .object({
    plan: z.string().max(40),
    quantity: z.number().int().min(1).max(20),
    delivery: z.string().max(20).nullable(),
    addons: z.array(z.string().max(20)).max(10),
    promoCode: z.string().trim().max(40).nullable(),
    mode: z.enum(["agreed", "advance"]).nullable(),
    contactName: z.string().max(100),
    contactPhone: z.string().max(40),
    contactEmail: z.string().max(200),
    country: z.string().max(60),
    city: z.string().max(100),
    address: z.string().max(300),
    postalCode: z.string().max(20),
    comment: z.string().max(1000),
    giftNote: z.string().max(500),
    desiredDate: z.string().max(10),
    surprise: z.boolean(),
    consent: z.boolean(),
  })
  .register(schemas, { id: "OrderPlaceBody" });

export const OrderPlaced = z.object({ orderId: uuid }).register(schemas, { id: "OrderPlaced" });

export const KaspiInvoice = z
  .object({ id: z.string(), method: z.string(), status: z.string(), amount: z.number(), phone: z.string().nullable(), link: z.string().nullable(), qrSvg: z.string().nullable(), expiresAt: z.string().nullable(), paidAt: z.string().nullable() })
  .register(schemas, { id: "KaspiInvoice" });

export const CabinetOrder = z
  .object({
    id: uuid,
    number: z.number().int(),
    title: z.string(),
    created: z.string(),
    bookId: z.string(),
    bookTitle: z.string(),
    status: z.string(),
    statusLabel: z.string(),
    tone: z.string(),
    printed: z.boolean(),
    paid: z.boolean(),
    nowTitle: z.string(),
    nowText: z.string(),
    /** state: done | current | todo */
    steps: z.array(z.object({ label: z.string(), state: z.string() })),
    stepOf: z.string().nullable(),
    trackingLabel: z.string(),
    trackingNumber: z.string().nullable(),
    detailsTitle: z.string(),
    facts: z.array(z.object({ label: z.string(), value: z.string() })),
    lines: z.array(PriceLine),
    totalLabel: z.string(),
    total: z.string(),
    quotedNote: z.string().nullable(),
    payment: z
      .object({
        title: z.string(),
        amount: z.string(),
        kaspi: z
          .object({
            title: z.string(),
            phoneLabel: z.string(),
            invoiceNote: z.string(),
            sendInvoice: z.string(),
            payByQr: z.string(),
            sentSteps: z.string(),
            scanQr: z.string(),
            openKaspi: z.string(),
            waiting: z.string(),
            paid: z.string(),
            failed: z.string(),
            cancelled: z.string(),
            expired: z.string(),
            again: z.string(),
            defaultPhone: z.string(),
            current: KaspiInvoice.nullable(),
          })
          .nullable(),
        manual: z.object({ title: z.string(), steps: z.array(z.string()), claim: z.string(), claimed: z.string().nullable() }).nullable(),
        unavailable: z.string(),
        cancel: z.object({ label: z.string(), title: z.string(), text: z.string(), confirm: z.string(), keep: z.string() }),
      })
      .nullable(),
  })
  .register(schemas, { id: "CabinetOrder" });

export const CabinetOrders = z
  .object({
    title: z.string(),
    lead: z.string(),
    empty: z.string(),
    emptyText: z.string(),
    orders: z.array(z.object({ id: uuid, number: z.number().int(), title: z.string(), bookTitle: z.string(), bookId: z.string(), status: z.string(), statusLabel: z.string(), tone: z.string(), amount: z.string(), created: z.string(), pay: z.string().nullable() })),
  })
  .register(schemas, { id: "CabinetOrders" });

export const KaspiPayBody = z.object({ method: z.enum(["invoice", "qr"]), phone: z.string().trim().max(32) }).register(schemas, { id: "KaspiPayBody" });
export const KaspiInvoiceResult = z.object({ invoice: KaspiInvoice }).register(schemas, { id: "KaspiInvoiceResult" });
export const OkResult = z.object({ ok: z.literal(true) }).register(schemas, { id: "OkResult" });

const BookParams = z.object({ bookId: uuid });
const OrderParams = z.object({ orderId: uuid });

export const cabinetOrderRoutes = {
  cabinetCheckout: { method: "GET", path: "/api/v1/cabinet/books/{bookId}/checkout", auth: "user", tag: "cabinet", summary: "Оформление заказа — как на сайте: проверка макета, тарифы, доставка, допы, договорённость", params: BookParams, response: CabinetCheckout },
  cabinetCheckoutQuote: { method: "POST", path: "/api/v1/cabinet/books/{bookId}/checkout/quote", auth: "user", tag: "cabinet", summary: "Итог по выбранному: строки чека и «К оплате» (правила цены сервера), проверка промокода", params: BookParams, body: CheckoutQuoteBody, response: CheckoutQuote },
  cabinetOrderPlace: { method: "POST", path: "/api/v1/cabinet/books/{bookId}/orders", auth: "user", tag: "cabinet", summary: "Оформить заказ (те же проверки, что у формы сайта)", params: BookParams, body: OrderPlaceBody, response: OrderPlaced },
  cabinetOrders: { method: "GET", path: "/api/v1/cabinet/orders", auth: "user", tag: "cabinet", summary: "Мои заказы", response: CabinetOrders },
  cabinetOrder: { method: "GET", path: "/api/v1/cabinet/orders/{orderId}", auth: "user", tag: "cabinet", summary: "Заказ — как на сайте: что сейчас, этапы, детали, чек, оплата", params: OrderParams, response: CabinetOrder },
  cabinetOrderKaspi: { method: "POST", path: "/api/v1/cabinet/orders/{orderId}/kaspi", auth: "user", tag: "cabinet", summary: "Оплата через Kaspi: счёт в приложение Kaspi по номеру или QR-код", params: OrderParams, body: KaspiPayBody, response: KaspiInvoiceResult },
  cabinetOrderKaspiStatus: { method: "GET", path: "/api/v1/cabinet/orders/{orderId}/kaspi/{invoiceId}", auth: "user", tag: "cabinet", summary: "Состояние счёта Kaspi (опрос, пока клиент платит)", params: z.object({ orderId: uuid, invoiceId: uuid }), response: KaspiInvoiceResult },
  cabinetOrderClaim: { method: "POST", path: "/api/v1/cabinet/orders/{orderId}/claim", auth: "user", tag: "cabinet", summary: "«Я оплатил(а)» переводом", params: OrderParams, response: OkResult },
  cabinetOrderCancel: { method: "POST", path: "/api/v1/cabinet/orders/{orderId}/cancel", auth: "user", tag: "cabinet", summary: "Отменить заказ — книга снова открыта для правок", params: OrderParams, response: OkResult },
} as const satisfies Record<string, RouteDef>;
