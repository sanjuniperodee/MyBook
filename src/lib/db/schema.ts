import { relations, sql } from "drizzle-orm";
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
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_idx").on(sql`lower(${t.email})`)],
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
    typography: text("typography").notNull().default("classic"),
    format: text("format").notNull().default("a5"),
    photoPlacement: text("photo_placement", { enum: ["chapters", "end"] }).notNull().default("chapters"),
    showToc: boolean("show_toc").notNull().default(true),
    /** Токен публичной ссылки для писем от близких; null — приём писем выключен. */
    inviteToken: text("invite_token"),
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

export const orderStatuses = [
  "pending_payment",
  "paid",
  "in_production",
  "shipped",
  "delivered",
  "cancelled",
] as const;
export type OrderStatus = (typeof orderStatuses)[number];

export interface OrderPrintSpec {
  format: string;
  pageCount: number;
  spineMm: number;
  coverWidthMm: number;
  coverHeightMm: number;
  generatedAt: string;
}

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
    trackingNumber: text("tracking_number"),
    adminNote: text("admin_note"),
    printSpec: jsonb("print_spec").$type<OrderPrintSpec>(),
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

export const usersRelations = relations(users, ({ many }) => ({
  books: many(books),
  orders: many(orders),
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
  user: one(users, { fields: [orders.userId], references: [users.id] }),
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
