/** Рекламные ссылки с UTM-метками и их переходы (модуль marketing). */
import { sql } from "drizzle-orm";
import { boolean, index, integer, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./identity";
import { crmConversations } from "./messaging";

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

/**
 * Переходы на рекламный лендинг (/skidka): каждый заход и нажатие «Написать в WhatsApp». Код перехода уходит в первое
 * сообщение; новый диалог WhatsApp привязывается к переходу по коду, а если код стёрт — по ближайшему нажатию перед
 * первым сообщением (match = time). IP не храним: для атрибуции он не нужен.
 */
export const landingVisits = pgTable(
  "landing_visits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Код перехода «lp» + 6 знаков — его страница дописывает в сообщение WhatsApp. */
    code: text("code").notNull().unique(),
    /** Какой лендинг (slug страницы: skidka). */
    landing: text("landing").notNull(),
    utmSource: text("utm_source").notNull().default(""),
    utmMedium: text("utm_medium").notNull().default(""),
    utmCampaign: text("utm_campaign").notNull().default(""),
    utmContent: text("utm_content").notNull().default(""),
    utmTerm: text("utm_term").notNull().default(""),
    /** Метки Meta: fbclid из адреса, cookie пикселя _fbp/_fbc (для Conversions API), id кампании, группы и объявления. */
    fbclid: text("fbclid").notNull().default(""),
    fbp: text("fbp").notNull().default(""),
    fbc: text("fbc").notNull().default(""),
    campaignId: text("campaign_id").notNull().default(""),
    adsetId: text("adset_id").notNull().default(""),
    adId: text("ad_id").notNull().default(""),
    placement: text("placement").notNull().default(""),
    referrer: text("referrer").notNull().default(""),
    userAgent: text("user_agent").notNull().default(""),
    /** iphone, android, ipad, desktop, other. */
    device: text("device").notNull().default(""),
    /** Встроенный браузер приложения: instagram, facebook, tiktok или пусто. */
    inApp: text("in_app").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Нажал кнопку WhatsApp (первое нажатие). */
    clickedAt: timestamp("clicked_at", { withTimezone: true }),
    /** Диалог, к которому привязан переход, и как: code — по коду в сообщении, time — по времени. */
    conversationId: uuid("conversation_id").references(() => crmConversations.id, { onDelete: "set null" }),
    match: text("match", { enum: ["code", "time"] }),
    matchedAt: timestamp("matched_at", { withTimezone: true }),
  },
  // Поиск «по времени»: свободные нажатия за последние минуты.
  (t) => [index("landing_visits_free_click_idx").on(t.clickedAt).where(sql`${t.conversationId} is null`)],
);
