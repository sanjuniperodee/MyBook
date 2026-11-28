/** Обращения: проблемы и просьбы клиентов и сотрудников (модуль support). */
import { index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { SupportAssist, SupportAttachment, SupportChat, SupportCommit, SupportEvent, SupportKind, SupportStatus, SupportUrgency } from "@/shared/domain/support";
import { timestamps } from "./columns";
import { users } from "./identity";

/**
 * Обращение. Номер (№) — короткий, его называют в чате и пишут в коммите («Обращение №12»): выкатка такого коммита
 * закрывает обращение и шлёт уведомление на notify_phone. Правила — в modules/support/domain.
 */
export const supportTickets = pgTable(
  "support_tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: serial("number").notNull(),
    status: text("status").$type<SupportStatus>().notNull().default("new"),
    kind: text("kind").$type<SupportKind>().notNull().default("bug"),
    urgency: text("urgency").$type<SupportUrgency>().notNull().default("normal"),
    /** Как описал человек — своими словами. */
    description: text("description").notNull().default(""),
    /** Где это: ссылка на страницу, книга, номер заказа. */
    place: text("place").notNull().default(""),
    /** Что ожидали увидеть. */
    expected: text("expected").notNull().default(""),
    reporterName: text("reporter_name").notNull().default(""),
    /** Номер WhatsApp, куда придёт уведомление, когда исправим. */
    notifyPhone: text("notify_phone").notNull().default(""),
    /** Телефон клиента, у которого проблема (сотрудник пишет за клиента). */
    clientPhone: text("client_phone").notNull().default(""),
    device: text("device").notNull().default(""),
    userAgent: text("user_agent").notNull().default(""),
    attachments: jsonb("attachments").$type<SupportAttachment[]>().notNull().default([]),
    /** Переписка клиента, из которой обращение: выбранный чат CRM и копии выбранных сообщений. */
    chat: jsonb("chat").$type<SupportChat | null>(),
    /** Суть от AI по описанию и расшифровкам: что случилось и что нужно сделать. */
    summary: text("summary").notNull().default(""),
    /** Что сделали — уходит человеку в уведомлении. */
    resolution: text("resolution").notNull().default(""),
    /** Заметка разработчика (не уходит наружу). */
    devNote: text("dev_note").notNull().default(""),
    commits: jsonb("commits").$type<SupportCommit[]>().notNull().default([]),
    /** Разбор помощником по книге: правки книги клиента, которые сотрудник подтверждает вместо клиента. */
    assist: jsonb("assist").$type<SupportAssist | null>(),
    history: jsonb("history").$type<SupportEvent[]>().notNull().default([]),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    /** Сколько раз пробовали разобрать вложения (расшифровка и суть): после сбоя — повтор по кнопке. */
    processedAttempts: integer("processed_attempts").notNull().default(0),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    notifyError: text("notify_error"),
    ...timestamps,
  },
  (t) => [uniqueIndex("support_tickets_number_idx").on(t.number), index("support_tickets_status_idx").on(t.status, t.createdAt)],
);
