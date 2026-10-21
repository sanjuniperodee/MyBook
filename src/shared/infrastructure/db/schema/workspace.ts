/** Рабочее пространство CRM: уведомления, быстрые ответы, свои поля, push-подписки, настройки (модуль workspace). */
import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { customFieldTypes } from "@/shared/domain/customFields";
import { timestamps } from "./columns";
import { users } from "./identity";
import { crmConversations } from "./messaging";

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
  /** Чей личный шаблон; null — общий (его ведёт руководитель в настройках), виден всем. */
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }),
  ...timestamps,
});

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

export type CrmField = typeof crmFields.$inferSelect;

/** Телефоны сотрудников с мобильным приложением: токен устройства для push (APNs у iPhone). Один токен — одно устройство. */
export const crmMobileDevices = pgTable(
  "crm_mobile_devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    platform: text("platform").notNull(),
    /** APNs: токены тестовых сборок (sandbox) и магазина (production) — разные адреса отправки. */
    environment: text("environment").notNull().default("production"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("crm_mobile_devices_user_idx").on(t.userId)],
);

/** Закреплённые чаты: у каждого сотрудника свои, поднимаются вверх его списка «Чатов». */
export const crmPinnedChats = pgTable(
  "crm_pinned_chats",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => crmConversations.id, { onDelete: "cascade" }),
    pinnedAt: timestamp("pinned_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("crm_pinned_chats_pk").on(t.userId, t.conversationId)],
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

/** Настройки CRM и интеграций. Секреты хранятся зашифрованными (AES-256-GCM, ключ из APP_SECRET). */
export const crmSettings = pgTable("crm_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedById: uuid("updated_by_id").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
