/** Переписка: диалоги, сообщения и чёрный список номеров (модуль messaging). */
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { timestamps } from "./columns";
import { users } from "./identity";
import { crmDeals } from "./sales";

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
    /**
     * Состояние бота (BotState в modules/messaging/domain/botEngine.ts): язык, что уже известно, о чём спрашивает, итог.
     * Пишется compare-and-set по полю version.
     */
    botState: jsonb("bot_state").$type<Record<string, unknown>>(),
    /** Когда бот должен сделать следующий ход: пауза после сообщения клиента, ожидание менеджера, проверка «клиент замолчал». */
    botDueAt: timestamp("bot_due_at", { withTimezone: true }),
    /** Служебные данные канала: для чата с сайта — страница и контакты посетителя, для почты — тема письма. */
    meta: jsonb("meta").$type<ConversationMeta>().notNull().default({}),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("crm_conv_chat_idx").on(t.channel, t.channelId, t.chatId),
    index("crm_conv_last_idx").on(t.lastMessageAt),
    index("crm_conv_bot_due_idx").on(t.botDueAt).where(sql`${t.botDueAt} is not null`),
  ],
);

export type CrmConversation = typeof crmConversations.$inferSelect;

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
    /** Исходящее без сотрудника: bot — бот-квалификатор, rule — правило автоматизации (в чате — «бот» / «автоматически»). */
    source: text("source", { enum: ["bot", "rule"] }),
    status: text("status", { enum: ["pending", "sent", "delivered", "read", "error", "received"] }).notNull().default("pending"),
    error: text("error"),
    /** Письма: тема и Message-ID для цепочки ответов. */
    subject: text("subject"),
    /** Ответ на сообщение (цитата в чате; в WhatsApp — reply). */
    replyToId: uuid("reply_to_id"),
    /** Переслано из другого диалога (в WhatsApp — пометка «Пересланное»). */
    forwarded: boolean("forwarded").notNull().default(false),
    /** Сотрудник изменил текст (в WhatsApp — «Изменено»). */
    editedAt: timestamp("edited_at", { withTimezone: true }),
    /** Сообщение удалено (у клиента — «удалено для всех»); текст в CRM скрыт. */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    /** Расшифровка голосового (по кнопке в чате или из распознавания AI-продажника). */
    transcript: text("transcript"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("crm_messages_conv_idx").on(t.conversationId, t.createdAt)],
);

/**
 * Журнал бота-квалификатора: старт и пропуск (с причиной), ответы, нераспознанное, частые вопросы, голосовые, передача
 * человеку, итог. Из него — метрики в настройках бота (воронка по вопросам, причины пропуска, языки).
 */
export const crmBotEvents = pgTable(
  "crm_bot_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => crmConversations.id, { onDelete: "cascade" }),
    dealId: uuid("deal_id").references(() => crmDeals.id, { onDelete: "set null" }),
    /** started | skipped | answer | unrecognized | faq | media | handoff | finished | stopped_by_manager | abandoned | declined */
    kind: text("kind").notNull(),
    field: text("field"),
    intent: text("intent"),
    lang: text("lang"),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("crm_bot_events_at_idx").on(t.createdAt), index("crm_bot_events_conv_idx").on(t.conversationId)],
);

/** Номера и чаты, помеченные как спам: по ним не создаются заявки и не приходят уведомления. */
export const crmBlocklist = pgTable("crm_blocklist", {
  value: text("value").primaryKey(),
  reason: text("reason").notNull().default("spam"),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
