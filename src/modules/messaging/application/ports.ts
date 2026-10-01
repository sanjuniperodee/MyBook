import type { Conversation, ConversationMeta, DealField, InboundMessage, BotConfig, BotMode } from "../domain";

/**
 * Диалоги. Счётчики (непрочитанные, «ждёт ответа», шаг бота) меняются параллельными вебхуками,
 * поэтому это атомарные операции репозитория, а не «прочитать — изменить — сохранить».
 */
export interface ConversationRepository {
  findById(id: string): Promise<Conversation | null>;
  findByChat(channel: string, channelId: string, chatId: string): Promise<Conversation | null>;
  /** null — параллельный вебхук уже создал такой диалог. */
  create(input: Pick<Conversation, "channel" | "channelId" | "chatId" | "contactName" | "avatarUrl" | "clientId" | "meta">): Promise<Conversation | null>;
  updateContact(id: string, patch: { contactName: string; avatarUrl: string | null; meta: ConversationMeta; clientId: string | null }): Promise<Conversation>;
  linkDeal(id: string, link: { dealId: string; clientId: string | null; assigneeId: string | null }): Promise<Conversation>;
  /** Входящее: +1 непрочитанное, «ждёт ответа» с момента первого неотвеченного, диалог открыт. */
  recordIncoming(id: string, text: string, at: Date): Promise<void>;
  /** Менеджер ответил с телефона — клиент больше не ждёт. */
  recordEcho(id: string, text: string, at: Date): Promise<void>;
  /** Исходящее из CRM. Ответ человека снимает «ждёт ответа» и останавливает бота; первый ответивший становится ответственным. */
  recordOutgoing(id: string, text: string, at: Date, authorId: string | null): Promise<void>;
  /** Спам: сообщение сохранено, диалог закрыт. */
  closeAsSpam(id: string, text: string, at: Date): Promise<void>;
  markRead(id: string): Promise<void>;
  /** Шаг бота from → to атомарно; false — менеджер уже ответил или параллельный вебхук. */
  advanceBot(id: string, from: number | null, to: number): Promise<boolean>;
  latestWhatsapp(chatId: string): Promise<Conversation | null>;
  /** Диалоги сделки: назначить ответственного (заявку приняли). */
  assignByDeal(dealId: string, userId: string): Promise<void>;
  /** Идентификаторы собеседников в диалогах сделки. */
  chatIdsByDeal(dealId: string): Promise<string[]>;
  /** Спам: диалоги сделки закрыты, ответа не ждут. */
  closeByDeal(dealId: string): Promise<void>;
}

export interface OutgoingMessage {
  id: string;
  conversationId: string;
  text: string;
  authorId: string | null;
  createdAt: Date;
}

export interface MessageRepository {
  /** false — повторная доставка вебхука. */
  insertIncoming(conversationId: string, m: InboundMessage, subject: string | null): Promise<boolean>;
  existsExternal(externalId: string): Promise<boolean>;
  /** Эхо нашего же сообщения, отправленного только что: дописать ему внешний ID. */
  claimPendingEcho(conversationId: string, text: string, since: Date, externalId: string): Promise<boolean>;
  insertEcho(conversationId: string, m: InboundMessage): Promise<boolean>;
  insertOutgoing(conversationId: string, text: string, authorId: string | null, internal?: boolean): Promise<OutgoingMessage>;
  setStatus(id: string, status: "sent" | "delivered" | "read" | "error", error?: string | null): Promise<void>;
  /** Эхо-вебхук мог прийти раньше ответа API и создать копию — оставляем исходное сообщение. */
  attachExternalId(id: string, externalId: string | null): Promise<void>;
  byExternalId(externalId: string): Promise<{ id: string; status: string; conversationId: string } | null>;
}

export interface Blocklist {
  isBlocked(...values: (string | null | undefined)[]): Promise<boolean>;
  add(values: string[], byUserId: string): Promise<void>;
  remove(value: string): Promise<void>;
}

/** Канал доставки исходящих: Wazzup, почта или виджет на сайте. */
export interface ChannelTransport {
  send(conv: Conversation, messageId: string, text: string): Promise<{ ok: true; externalId: string | null } | { ok: false; error: string }>;
}

/** Продажи (контекст Sales) — через узкий порт. */
export interface SalesGateway {
  findClientByPhone(phone: string): Promise<string | null>;
  findOpenDeal(opts: { clientId: string | null; phone: string | null }): Promise<{ id: string; assigneeId: string | null; clientId: string | null; utm: Record<string, string> | null } | null>;
  createDeal(input: { title: string; channel: string; clientId: string | null; contactName: string; contactPhone: string | null; contactEmail: string | null; utm: Record<string, string> | null; unsorted: boolean; source?: "site" }): Promise<{ id: string; assigneeId: string | null; clientId: string | null }>;
  setUtmIfEmpty(dealId: string, utm: Record<string, string>): Promise<void>;
  /** Менеджер ответил — заявка из «Неразобранного» принята (и взята им, если была ничья). */
  acceptUnsorted(dealId: string, authorId: string): Promise<void>;
  note(deal: { id: string; clientId: string | null }, text: string): Promise<void>;
  setField(dealId: string, key: string, value: string | number): Promise<void>;
  deal(dealId: string): Promise<{ id: string; clientId: string | null; assigneeId: string | null; title: string; contactName: string; customFields: Record<string, unknown> } | null>;
  nextRoundRobin(): Promise<string | null>;
}

/** Код рекламной ссылки в первом сообщении → UTM-метки. */
export interface LinkAttribution {
  fromText(text: string): Promise<Record<string, string> | null>;
}

export interface StaffNotifier {
  /** Ответственному или всем сотрудникам с правом. */
  notify(assigneeId: string | null, permission: "chats.view" | "deals.view", n: { kind: "message" | "task"; title: string; body: string; link: string }): Promise<void>;
}

/** Мгновенное обновление открытых экранов CRM. */
export interface LiveUpdates {
  chatChanged(conversationId: string): void;
  notificationsChanged(): void;
}

/** Правила CRM на входящее сообщение (контекст Automation). */
export interface IncomingRules {
  messageIncoming(ctx: { subject: string; conversationId: string; dealId: string | null; clientId: string | null; channel: string }): Promise<void>;
}

export interface BotSettings {
  mode(): Promise<BotMode>;
  config(): Promise<BotConfig>;
  isWorkTime(at: Date): Promise<boolean>;
  dealFields(): Promise<DealField[]>;
}

export interface Tasks {
  create(task: { title: string; kind: "call"; dueAt: Date; dealId: string; clientId: string | null; assigneeId: string | null }): Promise<void>;
}
