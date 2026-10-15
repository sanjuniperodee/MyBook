/** Отзывы клиентов о книгах (модуль feedback). */
import {
  boolean,
  index,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { Locale } from "@/i18n/config";
import type { ReviewPhoto, ReviewStatus } from "@/shared/domain/reviews";
import { timestamps } from "./columns";
import { users } from "./identity";
import { orders } from "./ordering";

/** Отзыв клиента о книге — один на заказ. Правила — в modules/feedback/domain. */
export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rating: smallint("rating").notNull(),
    text: text("text").notNull().default(""),
    authorName: text("author_name").notNull(),
    city: text("city").notNull().default(""),
    /** Согласие показать отзыв на сайте с именем и городом. */
    consent: boolean("consent").notNull().default(false),
    photo: jsonb("photo").$type<ReviewPhoto>(),
    status: text("status").$type<ReviewStatus>().notNull().default("new"),
    featured: boolean("featured").notNull().default(false),
    locale: text("locale").$type<Locale>().notNull().default("ru"),
    theme: text("theme").notNull(),
    thankYouCode: text("thank_you_code"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("reviews_order_idx").on(t.orderId), index("reviews_status_idx").on(t.status, t.featured)],
);

export type ReviewRow = typeof reviews.$inferSelect;
