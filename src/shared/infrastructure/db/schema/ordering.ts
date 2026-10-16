/** Заказы, промокоды, подарочные сертификаты и счета онлайн-оплаты (модуль ordering). */
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { Locale } from "@/i18n/config";
import type { GiftStatus, OrderPrintSpec, OrderStatus } from "@/shared/domain/orders";
import { books } from "./authoring";
import { timestamps } from "./columns";
import { users } from "./identity";

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: serial("number").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    bookId: uuid("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "restrict" }),
    plan: text("plan").notNull(),
    quantity: integer("quantity").notNull().default(1),
    itemsAmount: integer("items_amount").notNull(),
    discountAmount: integer("discount_amount").notNull().default(0),
    promoCode: text("promo_code"),
    deliveryAmount: integer("delivery_amount").notNull().default(0),
    /** Дополнения (экспресс, упаковка) и их стоимость. */
    addons: text("addons").array().notNull().default(sql`'{}'::text[]`),
    addonsAmount: integer("addons_amount").notNull().default(0),
    /** Внесено ранее менеджеру по договорённости (предоплата): оплачено до заказа, в «к оплате» не входит. */
    prepaidAmount: integer("prepaid_amount").notNull().default(0),
    amount: integer("amount").notNull(),
    currency: text("currency").notNull(),
    status: text("status").$type<OrderStatus>().notNull().default("pending_payment"),
    paymentProvider: text("payment_provider").notNull(),
    paymentId: text("payment_id"),
    paymentClaimedAt: timestamp("payment_claimed_at", { withTimezone: true }),
    contactName: text("contact_name").notNull(),
    contactPhone: text("contact_phone").notNull(),
    contactEmail: text("contact_email").notNull(),
    deliveryMethod: text("delivery_method"),
    city: text("city"),
    address: text("address"),
    postalCode: text("postal_code"),
    customerComment: text("customer_comment"),
    /** Текст подарочной открытки. */
    giftNote: text("gift_note"),
    /** К какой дате клиенту нужна книга (YYYY-MM-DD). */
    desiredDate: text("desired_date"),
    /** Сюрприз: не связываться с получателем заранее. */
    surprise: boolean("surprise").notNull().default(false),
    trackingNumber: text("tracking_number"),
    adminNote: text("admin_note"),
    printSpec: jsonb("print_spec").$type<OrderPrintSpec>(),
    /** Менеджер, ответственный за заказ. */
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    /** Постоплата: заказ отправлен в печать без оплаты; в выручку попадёт, когда оплата покроет «к оплате». */
    postpay: boolean("postpay").notNull().default(false),
    /** Сколько денег получено по заказу (сумма order_payments) — учёт денег, не выручка. */
    receivedAmount: integer("received_amount").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("orders_number_idx").on(t.number),
    index("orders_user_idx").on(t.userId),
    index("orders_status_idx").on(t.status),
  ],
);

/**
 * Журнал денег по заказу: перевод с чеком (менеджер), онлайн-оплата (Kaspi, CloudPayments — по операции), постоплата.
 * Это учёт денег, а не выручка: выручка заказа считается один раз — по orders.paid_at (revenue_events).
 */
export const orderPayments = pgTable(
  "order_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    amount: integer("amount").notNull(),
    /** manual — перевод с чеком; kaspi, cloudpayments — онлайн, подтверждено платёжной системой. */
    method: text("method", { enum: ["manual", "kaspi", "cloudpayments"] }).notNull(),
    /** Операция платёжной системы (повтор той же операции — не новая оплата). */
    externalRef: text("external_ref"),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull(),
    note: text("note").notNull().default(""),
    receiptStorageKey: text("receipt_storage_key"),
    receiptFileName: text("receipt_file_name"),
    receiptMime: text("receipt_mime"),
    receiptSize: integer("receipt_size"),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    /** Ручную оплату проверил руководитель (чек совпал с поступлением на счёт). */
    reviewedById: uuid("reviewed_by_id").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("order_payments_order_idx").on(t.orderId),
    index("order_payments_paid_idx").on(t.paidAt),
    uniqueIndex("order_payments_external_idx").on(t.method, t.externalRef).where(sql`${t.externalRef} is not null`),
  ],
);

export const promoCodes = pgTable(
  "promo_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Код в верхнем регистре. */
    code: text("code").notNull(),
    kind: text("kind", { enum: ["percent", "fixed"] }).notNull(),
    /** Процент (1–100) или сумма скидки в валюте магазина. */
    value: integer("value").notNull(),
    /** null — без ограничения количества использований. */
    maxUses: integer("max_uses"),
    usedCount: integer("used_count").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    active: boolean("active").notNull().default(true),
    note: text("note").notNull().default(""),
    /** Код-приглашение клиента: друзья получают скидку, владелец — награду за каждый оплаченный заказ. */
    ownerId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    /** Только на первую книгу: клиент ещё ничего не покупал. */
    firstOrderOnly: boolean("first_order_only").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("promo_codes_code_idx").on(t.code), index("promo_codes_owner_idx").on(t.ownerId)],
);

/** Подарочный сертификат. После оплаты для него создаётся одноразовый промокод на сумму сертификата. */
export const giftCards = pgTable(
  "gift_cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: serial("number").notNull(),
    /** Секрет в ссылке на страницу сертификата (покупатель может быть без аккаунта). */
    token: text("token").notNull(),
    plan: text("plan").notNull(),
    amount: integer("amount").notNull(),
    currency: text("currency").notNull(),
    status: text("status").$type<GiftStatus>().notNull().default("pending_payment"),
    paymentProvider: text("payment_provider").notNull(),
    paymentId: text("payment_id"),
    paymentClaimedAt: timestamp("payment_claimed_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    buyerUserId: uuid("buyer_user_id").references(() => users.id, { onDelete: "set null" }),
    buyerName: text("buyer_name").notNull(),
    buyerEmail: text("buyer_email").notNull(),
    buyerPhone: text("buyer_phone").notNull().default(""),
    recipientName: text("recipient_name").notNull(),
    /** Если указан — отправим сертификат получателю письмом в день sendAt. */
    recipientEmail: text("recipient_email"),
    message: text("message").notNull().default(""),
    /** Язык сертификата: PDF и письмо получателю. */
    locale: text("locale").$type<Locale>().notNull().default("ru"),
    /** Язык покупателя (сайта при покупке): письма о покупке и оплате. */
    buyerLocale: text("buyer_locale").$type<Locale>().notNull().default("ru"),
    /** YYYY-MM-DD; null — сразу после оплаты. */
    sendAt: text("send_at"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    promoCodeId: uuid("promo_code_id").references(() => promoCodes.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [uniqueIndex("gift_cards_number_idx").on(t.number), uniqueIndex("gift_cards_token_idx").on(t.token), index("gift_cards_status_idx").on(t.status)],
);

/**
 * Счета онлайн-оплаты Kaspi Pay: попытки оплатить заказ или сертификат (счёт в приложение по номеру или QR).
 * У одного заказа их может быть несколько — истёк, отменён, выставлен заново; заказ подтверждает оплаченный.
 */
export const paymentInvoices = pgTable(
  "payment_invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").$type<"kaspi">().notNull(),
    targetKind: text("target_kind").$type<"order" | "gift">().notNull(),
    targetId: uuid("target_id").notNull(),
    method: text("method").$type<"invoice" | "qr">().notNull(),
    /** Номер операции у провайдера (Kaspi: id счёта или QR-операции). */
    externalId: text("external_id").notNull(),
    phone: text("phone"),
    amount: integer("amount").notNull(),
    status: text("status").$type<"pending" | "paid" | "failed" | "cancelled" | "expired">().notNull().default("pending"),
    providerStatus: text("provider_status"),
    checkoutUrl: text("checkout_url"),
    qrToken: text("qr_token"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("payment_invoices_external_idx").on(t.provider, t.externalId),
    index("payment_invoices_target_idx").on(t.targetKind, t.targetId, t.createdAt),
    index("payment_invoices_status_idx").on(t.status, t.createdAt),
  ],
);

export const orderEvents = pgTable(
  "order_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    status: text("status").$type<OrderStatus>(),
    note: text("note").notNull().default(""),
    actor: text("actor").notNull().default("system"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("order_events_order_idx").on(t.orderId)],
);
