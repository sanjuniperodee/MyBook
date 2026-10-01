import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import type { Locale } from "@/i18n/config";
// Относительные пути: схему читает и drizzle-kit, который не знает алиас «@/».
import { ORDER_STATUSES, type OrderStatus } from "@/modules/ordering/domain/OrderStatus";
import type { OrderPrintSpec } from "@/modules/ordering/domain/Order";
import type { GiftStatus } from "@/modules/ordering/domain/GiftCard";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull().default(""),
    phone: text("phone"),
    role: text("role", { enum: ["user", "admin"] }).notNull().default("user"),
    /** Теги CRM (vip, блогер, корпоративный…). */
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    /** Когда клиенту последний раз отправляли напоминание дописать книгу. */
    remindedAt: timestamp("reminded_at", { withTimezone: true }),
    /** Клиент отписался от автоматических писем (транзакционные — о заказе — приходят всегда). */
    emailOptOut: boolean("email_opt_out").notNull().default(false),
    /** Язык интерфейса и писем: ru | kk. */
    locale: text("locale").$type<Locale>().notNull().default("ru"),
    /** Первое касание: UTM-метки, реферер и страница входа. */
    source: jsonb("source").$type<Record<string, string>>(),
    /** Роль сотрудника в CRM (для role = admin). null у сотрудника — полный доступ (владелец). */
    crmRoleId: uuid("crm_role_id").references(() => crmRoles.id, { onDelete: "set null" }),
    /** Ответственный менеджер клиента. */
    managerId: uuid("manager_id").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    /** Внутренний номер сотрудника в АТС (для звонков из CRM и привязки входящих). */
    sipExtension: text("sip_extension"),
    /** Сотрудник на смене: только такие получают новые заявки по кругу. */
    onShift: boolean("on_shift").notNull().default(true),
    /** Дополнительные телефоны клиента (второй номер, WhatsApp на другой SIM) — для поиска по звонкам и чатам. */
    extraPhones: text("extra_phones").array().notNull().default(sql`'{}'::text[]`),
    /** Значения своих полей клиента (crm_fields, entity = client). */
    customFields: jsonb("custom_fields").$type<CustomValues>().notNull().default({}),
    /** Сотрудник отключён: не может войти в CRM, не получает лиды. */
    staffDisabled: boolean("staff_disabled").notNull().default(false),
    /** Двухфакторный вход (TOTP): секрет зашифрован; включён, когда задано totpEnabledAt. */
    totpSecret: text("totp_secret"),
    totpEnabledAt: timestamp("totp_enabled_at", { withTimezone: true }),
    /** Резервные коды 2FA — sha256, использованный код удаляется. */
    totpBackup: text("totp_backup").array().notNull().default(sql`'{}'::text[]`),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_idx").on(sql`lower(${t.email})`), index("users_manager_idx").on(t.managerId)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(), // sha256 от токена из cookie
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const passwordResets = pgTable("password_resets", {
  id: text("id").primaryKey(), // sha256 от токена
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Gender = "m" | "f";

export interface InlinePhotoStyle {
  /** Ширина в процентах от ширины текста (25–100). */
  width: number;
  align: "left" | "center" | "right";
  /** После какого абзаца стоит фото: -1 — перед текстом, null — в конце. */
  anchor: number | null;
  aspect: "original" | "1:1" | "4:3" | "3:4" | "16:9";
  /** Точка фокуса для кадрирования, 0–1. */
  focusX: number;
  focusY: number;
  frame: "none" | "line" | "polaroid" | "round";
}

export const books = pgTable(
  "books",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    theme: text("theme").notNull(), // love | mom | dad | friend
    status: text("status", { enum: ["draft", "ordered"] }).notNull().default("draft"),
    title: text("title").notNull().default(""),
    subtitle: text("subtitle").notNull().default(""),
    authorName: text("author_name").notNull().default(""),
    authorGender: text("author_gender").$type<Gender>().notNull().default("f"),
    recipientName: text("recipient_name").notNull().default(""),
    recipientGender: text("recipient_gender").$type<Gender>().notNull().default("m"),
    hideRecipientOnCover: boolean("hide_recipient_on_cover").notNull().default(false),
    coverTemplate: text("cover_template").notNull().default("linen"),
    coverPhotoId: uuid("cover_photo_id"),
    backText: text("back_text").notNull().default(""),
    dedication: text("dedication").notNull().default(""),
    /** Оформление страниц — id из src/lib/book/interiors.ts. */
    interior: text("interior").notNull().default("classic"),
    format: text("format").notNull().default("a5"),
    photoPlacement: text("photo_placement", { enum: ["chapters", "end"] }).notNull().default("chapters"),
    showToc: boolean("show_toc").notNull().default(true),
    /** Токен публичной ссылки для писем от близких; null — приём писем выключен. */
    inviteToken: text("invite_token"),
    /** Язык книги: вопросы, заголовки глав и служебные страницы PDF (ru | kk). */
    language: text("language").$type<Locale>().notNull().default("ru"),
    /** Повод подарка (см. lib/occasions) и дата, к которой нужна книга. */
    occasion: text("occasion"),
    occasionDate: text("occasion_date"), // YYYY-MM-DD
    ...timestamps,
  },
  (t) => [index("books_user_idx").on(t.userId), uniqueIndex("books_invite_token_idx").on(t.inviteToken)],
);

export const bookQuestions = pgTable(
  "book_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookId: uuid("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    chapter: text("chapter").notNull(),
    /** Ключ вопроса из банка вопросов; "custom" — собственный вопрос пользователя. */
    questionKey: text("question_key"),
    /**
     * Шаблоны копируются в книгу при создании, поэтому банк вопросов можно менять,
     * не ломая уже начатые книги. Синтаксис рода: {он|она} — автор, [он|она] — адресат.
     */
    prompt: text("prompt").notNull(),
    title: text("title").notNull(),
    hint: text("hint"),
    /** Заголовок, отредактированный пользователем; null — берётся шаблон title. */
    displayText: text("display_text"),
    hideHeading: boolean("hide_heading").notNull().default(false),
    answer: text("answer").notNull().default(""),
    ...timestamps,
  },
  (t) => [index("book_questions_book_idx").on(t.bookId, t.position)],
);

export const photos = pgTable(
  "photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookId: uuid("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    storageKey: text("storage_key").notNull(),
    thumbKey: text("thumb_key").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    caption: text("caption").notNull().default(""),
    layout: text("layout", { enum: ["full", "bleed", "half"] }).notNull().default("full"),
    /** Фото, вставленное прямо в ответ на вопрос (печатается сразу после текста ответа). */
    questionId: uuid("question_id").references(() => bookQuestions.id, { onDelete: "set null" }),
    /** Оформление фото внутри ответа: размер, выравнивание, место в тексте, кадр, рамка. */
    inline: jsonb("inline").$type<InlinePhotoStyle>(),
    ...timestamps,
  },
  (t) => [index("photos_book_idx").on(t.bookId, t.position)],
);

export const bookLetters = pgTable(
  "book_letters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookId: uuid("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    authorName: text("author_name").notNull(),
    relation: text("relation").notNull().default(""),
    text: text("text").notNull(),
    status: text("status", { enum: ["pending", "approved", "hidden"] }).notNull().default("pending"),
    ...timestamps,
  },
  (t) => [index("book_letters_book_idx").on(t.bookId)],
);

/** Статусы заказа — язык домена (src/modules/ordering), схема лишь хранит их. */
export const orderStatuses = ORDER_STATUSES;
export type { OrderStatus, OrderPrintSpec };

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
    ...timestamps,
  },
  (t) => [
    uniqueIndex("orders_number_idx").on(t.number),
    index("orders_user_idx").on(t.userId),
    index("orders_status_idx").on(t.status),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("promo_codes_code_idx").on(t.code)],
);

/** Журнал автоматических писем: каждое письмо конкретного вида уходит клиенту один раз. */
export const emailLog = pgTable(
  "email_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Вид письма с уточнением, например «nudge:<bookId>». */
    key: text("key").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("email_log_user_key_idx").on(t.userId, t.key)],
);

export type { GiftStatus };

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

export type GiftCard = typeof giftCards.$inferSelect;

export const giftCardsRelations = relations(giftCards, ({ one }) => ({
  promo: one(promoCodes, { fields: [giftCards.promoCodeId], references: [promoCodes.id] }),
}));

/** Заметки менеджеров о клиенте (история общения). */
export const crmNotes = pgTable(
  "crm_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Клиент; у заметки по сделке без клиента (новый номер из чата/звонка) — null. */
    clientId: uuid("client_id").references(() => users.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    dealId: uuid("deal_id").references(() => crmDeals.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    kind: text("kind", { enum: ["note", "call", "message", "email", "system"] }).notNull().default("note"),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("crm_notes_client_idx").on(t.clientId), index("crm_notes_deal_idx").on(t.dealId)],
);

/** Задачи менеджеров: перезвонить, проверить макет, отправить трек-номер… */
export const crmTasks = pgTable(
  "crm_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    clientId: uuid("client_id").references(() => users.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "cascade" }),
    dealId: uuid("deal_id").references(() => crmDeals.id, { onDelete: "cascade" }),
    /** Тип задачи: звонок, написать, встреча, прочее. */
    kind: text("kind", { enum: ["task", "call", "message", "meeting"] }).notNull().default("task"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    /** Результат выполнения (как в amoCRM: «дозвонился, договорились…»). */
    result: text("result"),
    doneAt: timestamp("done_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("crm_tasks_due_idx").on(t.doneAt, t.dueAt)],
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

// ─── CRM: роли, аудит, сделки, коммуникации ─────────────────────────────────

/** Роль сотрудника: набор прав и видимость данных. Системные роли создаются миграцией и не удаляются. */
export const crmRoles = pgTable("crm_roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Ключ системной роли (owner, manager, production, support); у своих ролей — null. */
  key: text("key").unique(),
  name: text("name").notNull(),
  permissions: text("permissions").array().notNull().default(sql`'{}'::text[]`),
  /** all — видит все сделки/клиентов/чаты; own — только где он ответственный (и неразобранное). */
  scope: text("scope", { enum: ["all", "own"] }).notNull().default("all"),
  ...timestamps,
});

/** Журнал действий сотрудников: кто, что и когда изменил. */
export const crmAudit = pgTable(
  "crm_audit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    details: jsonb("details").$type<Record<string, unknown>>(),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("crm_audit_created_idx").on(t.createdAt), index("crm_audit_entity_idx").on(t.entity, t.entityId)],
);

/** Воронка продаж: «Продажи», «Корпоративные», «Партнёры»… У каждой свои этапы. */
export const crmPipelines = pgTable("crm_pipelines", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
  ...timestamps,
});

/** Этапы воронки продаж. kind: open — в работе, won — успех, lost — отказ. */
export const crmStages = pgTable("crm_stages", {
  id: uuid("id").primaryKey().defaultRandom(),
  pipelineId: uuid("pipeline_id")
    .notNull()
    .references(() => crmPipelines.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull().default("#9a8f86"),
  position: integer("position").notNull().default(0),
  kind: text("kind", { enum: ["open", "won", "lost"] }).notNull().default("open"),
  /** Событие на сайте, которое само переводит сделку на этот этап (только вперёд по воронке). */
  milestone: text("milestone").$type<StageMilestone>(),
  ...timestamps,
});

export { dealSources, type DealSource, type StageMilestone } from "@/modules/sales/domain/meta";
import type { DealSource, StageMilestone } from "@/modules/sales/domain/meta";

/** Сделка (лид): обращение, которое ведём до заказа. */
export const crmDeals = pgTable(
  "crm_deals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: serial("number").notNull(),
    title: text("title").notNull(),
    stageId: uuid("stage_id")
      .notNull()
      .references(() => crmStages.id),
    amount: integer("amount").notNull().default(0),
    clientId: uuid("client_id").references(() => users.id, { onDelete: "set null" }),
    contactName: text("contact_name").notNull().default(""),
    contactPhone: text("contact_phone"),
    contactEmail: text("contact_email"),
    source: text("source").$type<DealSource>().notNull().default("manual"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    lostReason: text("lost_reason"),
    /** «Неразобранное»: заявка с нового номера ждёт, пока менеджер её примет или отклонит. */
    unsorted: boolean("unsorted").notNull().default(false),
    extraPhones: text("extra_phones").array().notNull().default(sql`'{}'::text[]`),
    /** Откуда пришёл клиент: UTM-метки, реферер, короткая ссылка (из профиля на сайте или кода в первом сообщении). */
    utm: jsonb("utm").$type<Record<string, string>>(),
    /** Значения своих полей (crm_fields, entity = deal): { key: значение }. */
    customFields: jsonb("custom_fields").$type<CustomValues>().notNull().default({}),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    /** Последнее AI-резюме сделки: ситуация, следующий шаг, «температура». */
    aiSummary: jsonb("ai_summary").$type<{ summary: string; nextStep: string; dueDays: number; temperature: "hot" | "warm" | "cold"; risks: string; at: string }>(),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    stageChangedAt: timestamp("stage_changed_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("crm_deals_stage_idx").on(t.stageId), index("crm_deals_assignee_idx").on(t.assigneeId), index("crm_deals_client_idx").on(t.clientId)],
);

/** Диалог в мессенджере (WhatsApp, Instagram, Telegram через Wazzup). */
export interface ConversationMeta {
  /** Чат с сайта: страница, с которой написали, и контакты, которые оставил посетитель. */
  page?: string;
  phone?: string;
  email?: string;
  /** Почта: тема последнего письма и Message-ID для In-Reply-To. */
  subject?: string;
  lastMessageId?: string;
}

export const crmConversations = pgTable(
  "crm_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channel: text("channel").notNull(),
    /** Канал провайдера (номер WhatsApp, аккаунт Instagram). */
    channelId: text("channel_id").notNull().default(""),
    /** Идентификатор собеседника у провайдера: телефон для WhatsApp, логин/ID для остальных. */
    chatId: text("chat_id").notNull(),
    contactName: text("contact_name").notNull().default(""),
    avatarUrl: text("avatar_url"),
    clientId: uuid("client_id").references(() => users.id, { onDelete: "set null" }),
    dealId: uuid("deal_id").references(() => crmDeals.id, { onDelete: "set null" }),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    status: text("status", { enum: ["open", "closed"] }).notNull().default("open"),
    unread: integer("unread").notNull().default(0),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    lastMessageText: text("last_message_text").notNull().default(""),
    /** Последнее входящее, ещё без ответа — для SLA «ответить за N минут». */
    awaitingSince: timestamp("awaiting_since", { withTimezone: true }),
    /** Бот-квалификатор: номер текущего вопроса; null — не запускался, -1 — закончил или его остановил менеджер. */
    botStep: integer("bot_step"),
    /** Служебные данные канала: для чата с сайта — страница и контакты посетителя, для почты — тема письма. */
    meta: jsonb("meta").$type<ConversationMeta>().notNull().default({}),
    ...timestamps,
  },
  (t) => [uniqueIndex("crm_conv_chat_idx").on(t.channel, t.channelId, t.chatId), index("crm_conv_last_idx").on(t.lastMessageAt)],
);

export const crmMessages = pgTable(
  "crm_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => crmConversations.id, { onDelete: "cascade" }),
    direction: text("direction", { enum: ["in", "out"] }).notNull(),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    type: text("type").notNull().default("text"),
    text: text("text").notNull().default(""),
    mediaUrl: text("media_url"),
    externalId: text("external_id").unique(),
    /** Внутренняя заметка сотрудника в диалоге — клиенту не отправляется. */
    internal: boolean("internal").notNull().default(false),
    status: text("status", { enum: ["pending", "sent", "delivered", "read", "error", "received"] }).notNull().default("pending"),
    error: text("error"),
    /** Письма: тема и Message-ID для цепочки ответов. */
    subject: text("subject"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("crm_messages_conv_idx").on(t.conversationId, t.createdAt)],
);

/** Звонок из АТС. */
export const crmCalls = pgTable(
  "crm_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    externalId: text("external_id").notNull(),
    direction: text("direction", { enum: ["in", "out"] }).notNull(),
    /** Номер клиента (нормализованный, только цифры). */
    clientPhone: text("client_phone").notNull().default(""),
    /** Внутренний номер сотрудника, если известен. */
    extension: text("extension"),
    staffId: uuid("staff_id").references(() => users.id, { onDelete: "set null" }),
    clientId: uuid("client_id").references(() => users.id, { onDelete: "set null" }),
    dealId: uuid("deal_id").references(() => crmDeals.id, { onDelete: "set null" }),
    status: text("status", { enum: ["ringing", "answered", "missed", "busy", "failed"] }).notNull().default("ringing"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    durationSec: integer("duration_sec").notNull().default(0),
    /** Есть ли запись у провайдера (ссылку запрашиваем по требованию — она временная). */
    hasRecording: boolean("has_recording").notNull().default(false),
    recordingRef: text("recording_ref"),
    /** Звонок обработан (перезвонили / закрыли задачу) — для пропущенных. */
    handledAt: timestamp("handled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("crm_calls_ext_idx").on(t.provider, t.externalId), index("crm_calls_started_idx").on(t.startedAt), index("crm_calls_phone_idx").on(t.clientPhone)],
);

/** Уведомления сотрудникам: новые сообщения, пропущенные звонки, назначенные задачи. */
export const crmNotifications = pgTable(
  "crm_notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    link: text("link"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("crm_notif_user_idx").on(t.userId, t.readAt, t.createdAt)],
);

/** Быстрые ответы для чатов. Переменные: {имя}, {заказ}, {ссылка}. */
export const crmTemplates = pgTable("crm_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  text: text("text").notNull(),
  position: integer("position").notNull().default(0),
  ...timestamps,
});

export interface AutomationAction {
  type: "create_task" | "send_message" | "assign" | "move_stage" | "notify" | "create_deal";
  title?: string;
  text?: string;
  dueMinutes?: number;
  userId?: string | null;
  stageId?: string;
}

/** Правило автоматизации: событие → условия → действия. */
export const crmAutomations = pgTable("crm_automations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  trigger: text("trigger").notNull(),
  /** Условия: этап, источник, минуты без ответа и т.п. */
  conditions: jsonb("conditions").$type<Record<string, string | number | null>>().notNull().default({}),
  actions: jsonb("actions").$type<AutomationAction[]>().notNull().default([]),
  active: boolean("active").notNull().default(true),
  runs: integer("runs").notNull().default(0),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  ...timestamps,
});

/**
 * Transactional outbox: доменные события пишутся в той же транзакции, что и изменения агрегатов,
 * а воркер доставляет их подписчикам с повторами. Событие не теряется, даже если процесс упал
 * сразу после COMMIT. delivered — подписчики, которые уже отработали (повтор их не вызовет).
 */
export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<unknown>().notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    delivered: text("delivered").array().notNull().default(sql`'{}'::text[]`),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    /** Не раньше этого времени (повтор с нарастающей паузой). */
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    /** Кто-то уже доставляет событие — до этого времени его не трогаем. */
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    /** Попытки исчерпаны — событие ждёт разбора (dead letter). */
    failedAt: timestamp("failed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("outbox_pending_idx").on(t.processedAt, t.availableAt)],
);

/** Журнал срабатываний: одно правило не срабатывает дважды для одного объекта. */
export const crmAutomationRuns = pgTable(
  "crm_automation_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    automationId: uuid("automation_id")
      .notNull()
      .references(() => crmAutomations.id, { onDelete: "cascade" }),
    subject: text("subject").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("crm_auto_runs_idx").on(t.automationId, t.subject)],
);

/** История смены этапов: основа честной воронки (конверсия этап → этап, время на этапе). */
export const crmStageHistory = pgTable(
  "crm_stage_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => crmDeals.id, { onDelete: "cascade" }),
    fromStageId: uuid("from_stage_id").references(() => crmStages.id, { onDelete: "set null" }),
    toStageId: uuid("to_stage_id")
      .notNull()
      .references(() => crmStages.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("crm_stage_hist_deal_idx").on(t.dealId, t.createdAt), index("crm_stage_hist_to_idx").on(t.toStageId, t.createdAt)],
);

export type CustomValues = Record<string, string | number | boolean | null>;
export const customFieldTypes = ["text", "number", "date", "select", "checkbox"] as const;

/** Свои поля сделки или клиента (как в amoCRM): повод, дата события, для кого… */
export const crmFields = pgTable(
  "crm_fields",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entity: text("entity", { enum: ["deal", "client"] }).notNull(),
    /** Латиница: ключ в customFields; не меняется после создания. */
    key: text("key").notNull(),
    label: text("label").notNull(),
    type: text("type", { enum: customFieldTypes }).notNull().default("text"),
    options: text("options").array().notNull().default(sql`'{}'::text[]`),
    position: integer("position").notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex("crm_fields_key_idx").on(t.entity, t.key)],
);

/** Сохранённые фильтры списков (свои и общие для команды). */
export const crmSavedViews = pgTable(
  "crm_saved_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entity: text("entity").notNull().default("deals"),
    name: text("name").notNull(),
    query: text("query").notNull(),
    shared: boolean("shared").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("crm_views_user_idx").on(t.userId)],
);

/** План продаж сотрудника на месяц (YYYY-MM). */
export const crmPlans = pgTable(
  "crm_plans",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    month: text("month").notNull(),
    amount: integer("amount").notNull().default(0),
    deals: integer("deals").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.month] })],
);

/** Подписки браузеров сотрудников на push-уведомления (Web Push). */
export const crmPushSubscriptions = pgTable(
  "crm_push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("crm_push_user_idx").on(t.userId)],
);

/** Рекламные ссылки с UTM-метками: короткий адрес /go/код ведёт на страницу сайта или в WhatsApp. */
export const crmLinks = pgTable("crm_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["site", "whatsapp"] }).notNull().default("site"),
  /** Страница сайта (для kind = site). */
  targetPath: text("target_path").notNull().default("/"),
  /** Текст первого сообщения (для kind = whatsapp); к нему добавляется код ссылки. */
  waText: text("wa_text").notNull().default(""),
  utmSource: text("utm_source").notNull(),
  utmMedium: text("utm_medium").notNull().default(""),
  utmCampaign: text("utm_campaign").notNull().default(""),
  utmContent: text("utm_content").notNull().default(""),
  clicks: integer("clicks").notNull().default(0),
  archived: boolean("archived").notNull().default(false),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Переходы по ссылкам по дням — для отчётов за период. */
export const crmLinkClicks = pgTable(
  "crm_link_clicks",
  {
    linkId: uuid("link_id")
      .notNull()
      .references(() => crmLinks.id, { onDelete: "cascade" }),
    day: text("day").notNull(), // YYYY-MM-DD по Алматы
    clicks: integer("clicks").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.linkId, t.day] })],
);

/** Номера и чаты, помеченные как спам: по ним не создаются заявки и не приходят уведомления. */
export const crmBlocklist = pgTable("crm_blocklist", {
  value: text("value").primaryKey(),
  reason: text("reason").notNull().default("spam"),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Настройки CRM и интеграций. Секреты хранятся зашифрованными (AES-256-GCM, ключ из APP_SECRET). */
export const crmSettings = pgTable("crm_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedById: uuid("updated_by_id").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const crmStagesRelations = relations(crmStages, ({ one }) => ({
  pipeline: one(crmPipelines, { fields: [crmStages.pipelineId], references: [crmPipelines.id] }),
}));

export const crmDealsRelations = relations(crmDeals, ({ one }) => ({
  stage: one(crmStages, { fields: [crmDeals.stageId], references: [crmStages.id] }),
  client: one(users, { fields: [crmDeals.clientId], references: [users.id], relationName: "dealClient" }),
  assignee: one(users, { fields: [crmDeals.assigneeId], references: [users.id], relationName: "dealAssignee" }),
  order: one(orders, { fields: [crmDeals.orderId], references: [orders.id] }),
}));

export const crmConversationsRelations = relations(crmConversations, ({ one, many }) => ({
  client: one(users, { fields: [crmConversations.clientId], references: [users.id], relationName: "convClient" }),
  assignee: one(users, { fields: [crmConversations.assigneeId], references: [users.id], relationName: "convAssignee" }),
  deal: one(crmDeals, { fields: [crmConversations.dealId], references: [crmDeals.id] }),
  messages: many(crmMessages),
}));

export const crmMessagesRelations = relations(crmMessages, ({ one }) => ({
  conversation: one(crmConversations, { fields: [crmMessages.conversationId], references: [crmConversations.id] }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  books: many(books),
  orders: many(orders, { relationName: "customer" }),
  assignedOrders: many(orders, { relationName: "assignee" }),
}));

export const booksRelations = relations(books, ({ one, many }) => ({
  user: one(users, { fields: [books.userId], references: [users.id] }),
  questions: many(bookQuestions),
  photos: many(photos),
  letters: many(bookLetters),
  orders: many(orders),
}));

export const bookQuestionsRelations = relations(bookQuestions, ({ one }) => ({
  book: one(books, { fields: [bookQuestions.bookId], references: [books.id] }),
}));

export const bookLettersRelations = relations(bookLetters, ({ one }) => ({
  book: one(books, { fields: [bookLetters.bookId], references: [books.id] }),
}));

export const photosRelations = relations(photos, ({ one }) => ({
  book: one(books, { fields: [photos.bookId], references: [books.id] }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, { fields: [orders.userId], references: [users.id], relationName: "customer" }),
  assignee: one(users, { fields: [orders.assigneeId], references: [users.id], relationName: "assignee" }),
  book: one(books, { fields: [orders.bookId], references: [books.id] }),
  events: many(orderEvents),
}));

export const orderEventsRelations = relations(orderEvents, ({ one }) => ({
  order: one(orders, { fields: [orderEvents.orderId], references: [orders.id] }),
}));

export type User = typeof users.$inferSelect;
export type Book = typeof books.$inferSelect;
export type BookQuestion = typeof bookQuestions.$inferSelect;
export type Photo = typeof photos.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderEvent = typeof orderEvents.$inferSelect;
export type BookLetter = typeof bookLetters.$inferSelect;
export type PromoCode = typeof promoCodes.$inferSelect;
export type CrmNote = typeof crmNotes.$inferSelect;
export type CrmTask = typeof crmTasks.$inferSelect;
export type CrmRole = typeof crmRoles.$inferSelect;
export type CrmStage = typeof crmStages.$inferSelect;
export type CrmPipeline = typeof crmPipelines.$inferSelect;
export type CrmField = typeof crmFields.$inferSelect;
export type CrmLink = typeof crmLinks.$inferSelect;
export type CrmDeal = typeof crmDeals.$inferSelect;
export type CrmConversation = typeof crmConversations.$inferSelect;
export type CrmMessage = typeof crmMessages.$inferSelect;
export type CrmCall = typeof crmCalls.$inferSelect;
export type CrmNotification = typeof crmNotifications.$inferSelect;
export type CrmAutomation = typeof crmAutomations.$inferSelect;
