import type { BotCatalog, BotConfig, BotEvent, BotInput, BotLang, BotMode, BotState, Conversation, ConversationMeta, DealField, FaqIntent, HandoffKind, InboundMessage } from "../domain";

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
  /** История задним числом: последнее сообщение — только если оно новее записанного; без «непрочитано» и «ждёт ответа». */
  recordHistory(id: string, text: string, at: Date): Promise<void>;
  /** Исходящее из CRM. Ответ человека снимает «ждёт ответа» и останавливает бота; первый ответивший становится ответственным. */
  recordOutgoing(id: string, text: string, at: Date, authorId: string | null): Promise<void>;
  /** Спам: сообщение сохранено, диалог закрыт. */
  closeAsSpam(id: string, text: string, at: Date): Promise<void>;
  markRead(id: string): Promise<void>;
  /** Шаг бота from → to атомарно; false — менеджер уже ответил или параллельный вебхук. */
  advanceBot(id: string, from: number | null, to: number): Promise<boolean>;
  latestWhatsapp(chatId: string): Promise<Conversation | null>;
  /** Диалоги сделки: назначить ответственного (заявку приняли). */
  linkClientByDeal(dealId: string, clientId: string): Promise<void>;
  assignByDeal(dealId: string, userId: string): Promise<void>;
  /** Идентификаторы собеседников в диалогах сделки. */
  chatIdsByDeal(dealId: string): Promise<string[]>;
  setAssignee(id: string, userId: string | null): Promise<void>;
  /** Закрытый диалог больше не «ждёт ответа». */
  setStatus(id: string, status: "open" | "closed"): Promise<void>;
  /** Спам: диалоги сделки закрыты, ответа не ждут. */
  closeByDeal(dealId: string): Promise<void>;
}

/** Кто написал без сотрудника. */
export type MessageSource = "bot" | "rule";

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
  /** source — кто отправил без сотрудника: бот или правило (в чате подписываются «бот» / «автоматически»). */
  insertOutgoing(conversationId: string, text: string, authorId: string | null, internal?: boolean, source?: MessageSource): Promise<OutgoingMessage>;
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
  /** Руководителям (право «Сотрудники и роли»): то, что нужно проверить, — например, реквизиты с телефона компании. */
  managers?(n: { kind: "system"; title: string; body: string; link: string }): Promise<void>;
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
  /** Когда начнётся рабочее время (сейчас рабочее — сам момент at); null — график без рабочих дней. */
  nextWorkStart(at: Date): Promise<Date | null>;
  dealFields(): Promise<DealField[]>;
  /** Цены, доставка и сроки из «Цен и тарифов» — для ответов на частые вопросы. */
  catalog(): Promise<BotCatalog>;
  /** Адрес сайта, открыта ли регистрация, какие темы книг и посадочные страницы есть. */
  site(): Promise<{ url: string; registrationOpen: boolean; themes: string[]; landings: string[] }>;
  timeZone(): string;
}

/** Состояние бота в диалоге. Запись — compare-and-set: параллельные вебхуки и ответ менеджера не теряются. */
export interface BotRecord {
  botStep: number | null;
  state: BotState | null;
  dueAt: Date | null;
}

export interface BotStore {
  load(conversationId: string): Promise<BotRecord | null>;
  /**
   * Записать состояние, если с прошлого чтения его не меняли (version; null — состояния ещё нет) и человек не остановил
   * бота (bot_step <> -1; restart — перезапуск кнопкой, когда бот уже закончил). false — надо перечитать.
   */
  save(conversationId: string, expectedVersion: number | null, next: { botStep: number | null; state: BotState; dueAt: Date | null }, opts?: { restart?: boolean }): Promise<boolean>;
  /** Когда сделать следующий ход (пауза после сообщения клиента); только пока бот не остановлен. */
  setDue(conversationId: string, dueAt: Date | null): Promise<void>;
  /** Ответил человек (с телефона, из CRM или кнопкой «Остановить»): бот больше не пишет. true — бот вёл или собирался вести диалог. */
  stop(conversationId: string, reason: string): Promise<boolean>;
  /** Диалоги, где пора сделать ход. */
  due(now: Date, limit: number): Promise<string[]>;
  /** Входящие диалога начиная с момента since. */
  incoming(conversationId: string, since: Date): Promise<BotInput[]>;
  /** Журнал бота (метрики в настройках). */
  log(conversationId: string, dealId: string | null, lang: string | null, events: BotEvent[]): Promise<void>;
}

/** Что бот узнаёт о клиенте и сделке перед опросом (контексты Sales, Ordering, Authoring — через контейнер). */
export interface BotCrm {
  deal(dealId: string): Promise<{ orderId: string | null; firstStage: boolean; closed: boolean; assigneeId: string | null; unsorted: boolean; customFields: Record<string, unknown>; contactName: string; title: string; clientId: string | null } | null>;
  client(clientId: string): Promise<{ orders: number; books: number; locale: string | null; name: string | null } | null>;
  /** Метка сделки («тема: Маме»). */
  tag(dealId: string, tag: string): Promise<void>;
  /** Была ли переписка с этим номером до CRM (история шлюза WhatsApp) — тогда это не новый клиент; историю — в диалог. */
  priorChat(conv: Conversation, before: Date): Promise<boolean>;
}

/** AI: понять ответ, который детерминированный разбор не понял. Только поля и намерения — тексты клиенту из настроек. */
export interface BotBrain {
  understand(input: { messages: { from: "client" | "bot"; text: string }[]; fields: DealField[]; asking: string | null; today: string }): Promise<{ fields: Record<string, string>; intents: FaqIntent[]; handoff: HandoffKind | null; lang: BotLang | null } | null>;
}

/** Отложенный ход бота в этом процессе (пауза после сообщения клиента). Если процесс перезапустится — подберёт планировщик. */
export interface BotTimers {
  schedule(key: string, at: Date, run: () => void): void;
}

export interface Tasks {
  create(task: { title: string; kind: "call" | "message"; dueAt: Date; dealId: string; clientId: string | null; assigneeId: string | null }): Promise<void>;
}

/** Вложение сообщения — то, что нужно, чтобы открыть его файл в CRM. */
export interface MessageMedia {
  id: string;
  conversationId: string;
  type: string;
  /** Где лежит файл: ссылка нашего прокси на файл шлюза или адрес Wazzup; null — файла ещё нет. */
  mediaUrl: string | null;
  externalId: string | null;
}

/** Вложения сообщений (репозиторий сообщений). */
export interface MessageMediaStore {
  media(id: string): Promise<MessageMedia | null>;
  /** Шлюз скачал файл — запомнить ссылку на него (заменяет прежнюю, если шлюз её файл удалил): второй раз файл не качается. */
  saveMediaUrl(id: string, mediaUrl: string): Promise<void>;
}

/** Файл вложения, который отдаётся сотруднику. */
export interface MediaFile {
  body: ReadableStream<Uint8Array>;
  contentType: string | null;
  size: string | null;
  /** Отдана часть файла по Range (206): Content-Range шлюза, например «bytes 0-1023/148201». */
  range?: string | null;
}

/** Файлы своего шлюза WhatsApp (GOWA). Ошибки шлюза — исключением с понятным сотруднику текстом. */
export interface MediaGateway {
  /** Скачать в шлюз вложение сообщения; путь к файлу (statics/media/…). */
  download(externalId: string, chatId: string): Promise<string>;
  /** range — заголовок Range браузера как есть; шлюз отдаёт часть файла (206) или весь файл. */
  file(path: string, range?: string | null): Promise<MediaFile | null>;
}
