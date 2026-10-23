/** Рекламные ссылки с UTM-метками и их переходы (модуль marketing). */
import { boolean, index, integer, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./identity";

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
    day: text("day").notNull(), // YYYY-MM-DD по часовому поясу магазина (storeTimeZone)
    clicks: integer("clicks").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.linkId, t.day] })],
);

/**
 * Расходы на рекламу по каналам (analytics-7): сколько потратили на канал в день — для ROMI и стоимости заявки в отчёте
 * по каналам. Вводит сотрудник с правом promo.manage, каждая запись — в журнале.
 */
export const marketingSpend = pgTable(
  "marketing_spend",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Канал привлечения (ChannelKey: instagram, tiktok, bloggers…). */
    channel: text("channel").notNull(),
    /** День расхода по поясу магазина: ГГГГ-ММ-ДД. */
    day: text("day").notNull(),
    amount: integer("amount").notNull(),
    note: text("note").notNull().default(""),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("marketing_spend_day_idx").on(t.day)],
);
