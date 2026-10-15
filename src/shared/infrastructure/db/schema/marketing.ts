/** Рекламные ссылки с UTM-метками и их переходы (модуль marketing). */
import { boolean, integer, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
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
