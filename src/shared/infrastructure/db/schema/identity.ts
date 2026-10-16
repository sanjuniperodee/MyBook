/**
 * Учётные записи: клиенты и сотрудники в одной таблице users, сессии, сброс пароля (модуль identity).
 * Колонки CRM в users (роль, ответственный, АТС, свои поля) ведут access, clients, telephony и workspace.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import type { Locale } from "@/i18n/config";
import type { CustomFieldValues } from "@/shared/domain/customFields";
import { crmRoles } from "./access";
import { timestamps } from "./columns";

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
    customFields: jsonb("custom_fields").$type<CustomFieldValues>().notNull().default({}),
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

export type User = typeof users.$inferSelect;

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
  /** reset — сброс по почте; access — доступ в кабинет после оплаты по счёту из чата (без прав администратора). */
  purpose: text("purpose", { enum: ["reset", "access"] }).notNull().default("reset"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
