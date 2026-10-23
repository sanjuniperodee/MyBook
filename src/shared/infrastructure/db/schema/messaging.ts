/** Переписка: диалоги, сообщения и чёрный список номеров (модуль messaging). */
import {
  boolean,
  check,
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
    /**
     * Последний ответ человека: из CRM или с телефона магазина (эхо). Бот и правила его не двигают. Правило «клиент
     * молчит после нашего ответа» (automation-6).
     */
    lastOutgoingAt: timestamp("last_outgoing_at", { withTimezone: true }),
    /** Бот-квалификатор: номер текущего вопроса; null — не запускался, -1 — закончил или его остановил менеджер. */
    botStep: integer("bot_step"),
    /**
     * Состояние бота (BotState в modules/messaging/domain/botEngine.ts): язык, что уже известно, о чём спрашивает, итог.
     * Пишется compare-and-set по полю version.
     */
    botState: jsonb("bot_state").$type<Record<string, unknown>>(),
    /** Когда бот должен сделать следующий ход: пауза после сообщения клиента, ожидание менеджера, проверка «клиент замолчал». */
    botDueAt: timestamp("bot_due_at", { withTimezone: true }),
    /** Когда AI последний раз разбирал переписку менеджера в пустые поля сделки (bots-4): новые сообщения — разобрать снова. */
    aiParsedAt: timestamp("ai_parsed_at", { withTimezone: true }),
    /** Служебные данные канала: для чата с сайта — страница и контакты посетителя, для почты — тема письма. */
    meta: jsonb("meta").$type<ConversationMeta>().notNull().default({}),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("crm_conv_chat_idx").on(t.channel, t.channelId, t.chatId),
    index("crm_conv_last_idx").on(t.lastMessageAt),
    index("crm_conv_bot_due_idx").on(t.botDueAt).where(sql`${t.botDueAt} is not null`),
    // Правило «клиенту не ответили N минут» (каждую минуту): ждущие ответа, дольше всех ждущие — первыми.
    index("crm_conv_awaiting_idx").on(t.awaitingSince).where(sql`${t.awaitingSince} is not null`),
    // Правило «клиент молчит после нашего ответа» (раз в 30 минут): наш ответ в окне «N часов назад − неделя».
    index("crm_conv_last_out_idx").on(t.lastOutgoingAt).where(sql`${t.lastOutgoingAt} is not null`),
    // Переписка сделки и клиента: куда правило пишет о заказе, диалоги карточек сделки и клиента.
    index("crm_conv_deal_idx").on(t.dealId),
    index("crm_conv_client_idx").on(t.clientId),
    // Автозаполнение полей сделки: сколько диалогов разобрано за сегодня (дневной лимит).
    index("crm_conv_ai_parsed_idx").on(t.aiParsedAt).where(sql`${t.aiParsedAt} is not null`),
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
    /**
     * Ответ с телефона магазина (эхо): у кого был телефон в ту минуту («Телефон WhatsApp у …») — отчёт по менеджерам
     * считает его ответы (analytics-d3). Автором (author_id) не становится: писал не из CRM.
     */
    attributedTo: uuid("attributed_to").references(() => users.id, { onDelete: "set null" }),
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
  (t) => [
    index("crm_messages_conv_idx").on(t.conversationId, t.createdAt),
    // Суточный лимит сообщений клиентам от правил (automation-15): счёт за сегодня — по этому индексу, без обхода переписки.
    index("crm_messages_rule_idx").on(t.createdAt).where(sql`${t.source} = 'rule' and ${t.internal} = false`),
  ],
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
    /** started | takeover | skipped | answer | unrecognized | faq | media | handoff | finished | stopped_by_manager | abandoned | declined | … (BotEventKind) */
    kind: text("kind").notNull(),
    field: text("field"),
    intent: text("intent"),
    lang: text("lang"),
    reason: text("reason"),
    /** След хода AI-продажника (kind = turn): что решила модель и что сделал код — «Почему так?» у ответа бота. */
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    /** Последнее сообщение клиенту в этом ходе — у него в чате «Почему так?». */
    messageId: uuid("message_id").references(() => crmMessages.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("crm_bot_events_at_idx").on(t.createdAt),
    index("crm_bot_events_conv_idx").on(t.conversationId),
    // «Почему так?» в чате: след по id сообщения (есть только у ходов продажника).
    index("crm_bot_events_message_idx").on(t.messageId).where(sql`${t.messageId} is not null`),
    // Чистка следов старше 90 дней в проходе планировщика — по своим строкам, без обхода остального журнала.
    index("crm_bot_events_turn_at_idx").on(t.createdAt).where(sql`${t.kind} = 'turn'`),
  ],
);

/**
 * Стоп-лист номеров и чатов. spam — по ним не создаются заявки и не приходят уведомления, писать им нельзя;
 * no_marketing — «не писать первым»: входящие и ответы как обычно, но бот не напоминает о себе и правила не пишут.
 */
export const crmBlocklist = pgTable(
  "crm_blocklist",
  {
    value: text("value").primaryKey(),
    reason: text("reason", { enum: ["spam", "no_marketing"] }).notNull().default("spam"),
    /** Почему в стоп-листе: слова сотрудника или фраза клиента, по которой номер попал сюда сам. */
    note: text("note"),
    /** Кто добавил; null — CRM сама (клиент написал «не пишите мне»). */
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("crm_blocklist_reason_check", sql`${t.reason} in ('spam', 'no_marketing')`)],
);
