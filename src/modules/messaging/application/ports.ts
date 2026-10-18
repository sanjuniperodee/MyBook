import type { BotCatalog, BotConfig, BotLesson, CoachConversation, CoachRun, HistoryMessage, BotEvent, BotInput, BotLang, BotMode, BotState, Conversation, ConversationMeta, DealField, FaqIntent, HandoffKind, InboundMessage } from "../domain";

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
  /** awaiting: false — сообщение не открывает «ждёт ответа» (клиент только поблагодарил); открытое ожидание не снимается. */
  recordIncoming(id: string, text: string, at: Date, opts?: { awaiting?: boolean }): Promise<void>;
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

/** Вложение, ответ и пересылка у исходящего. */
export interface OutgoingExtra {
  type?: string;
  mediaUrl?: string | null;
  replyToId?: string | null;
  forwarded?: boolean;
}

/** Сообщение из базы — для правки, удаления, ответа и пересылки. */
export interface StoredMessage {
  id: string;
  conversationId: string;
  direction: "in" | "out";
  type: string;
  text: string;
  mediaUrl: string | null;
  externalId: string | null;
  internal: boolean;
  authorId: string | null;
  source: MessageSource | null;
  status: string;
  deletedAt: Date | null;
  transcript: string | null;
  createdAt: Date;
}

/** Файл, который сотрудник отправляет или пересылает клиенту. */
export interface OutgoingFile {
  data: Uint8Array;
  name: string;
  mime: string;
  /** Как отправить в WhatsApp: фото, видео, голосовое/аудио или файлом. */
  kind: "image" | "video" | "audio" | "document";
}

type SendResult = { ok: true; externalId: string | null } | { ok: false; error: string };

export interface MessageRepository {
  /** false — повторная доставка вебхука. */
  insertIncoming(conversationId: string, m: InboundMessage, subject: string | null): Promise<boolean>;
  existsExternal(externalId: string): Promise<boolean>;
  /** Эхо нашего же сообщения, отправленного только что: дописать ему внешний ID. */
  claimPendingEcho(conversationId: string, text: string, since: Date, externalId: string): Promise<boolean>;
  insertEcho(conversationId: string, m: InboundMessage): Promise<boolean>;
  /** source — кто отправил без сотрудника: бот или правило (в чате подписываются «бот» / «автоматически»). */
  insertOutgoing(conversationId: string, text: string, authorId: string | null, internal?: boolean, source?: MessageSource, extra?: OutgoingExtra): Promise<OutgoingMessage>;
  /** Сообщение для правки, удаления, ответа и пересылки. */
  findOne(id: string): Promise<StoredMessage | null>;
  editText(id: string, text: string, at: Date): Promise<void>;
  markDeleted(id: string, at: Date): Promise<void>;
  setTranscript(id: string, text: string): Promise<void>;
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
  send(conv: Conversation, messageId: string, text: string, opts?: { replyTo?: string | null; forwarded?: boolean }): Promise<SendResult>;
  /** Файл клиенту (фото, видео, голосовое, документ); нет у канала — не умеет. */
  sendFile?(conv: Conversation, file: OutgoingFile, opts: { caption: string; replyTo?: string | null; forwarded?: boolean }): Promise<SendResult>;
  /** Изменить отправленное (WhatsApp — в течение 15 минут). */
  edit?(conv: Conversation, externalId: string, text: string): Promise<{ ok: true } | { ok: false; error: string }>;
  /** Удалить у клиента («удалить для всех»). */
  revoke?(conv: Conversation, externalId: string): Promise<{ ok: true } | { ok: false; error: string }>;
}

/** Продажи (контекст Sales) — через узкий порт. */
export interface SalesGateway {
  findClientByPhone(phone: string): Promise<string | null>;
  findOpenDeal(opts: { clientId: string | null; phone: string | null }): Promise<{ id: string; assigneeId: string | null; clientId: string | null; utm: Record<string, string> | null } | null>;
  createDeal(input: { title: string; channel: string; clientId: string | null; contactName: string; contactPhone: string | null; contactEmail: string | null; utm: Record<string, string> | null; unsorted: boolean; source?: "site" }): Promise<{ id: string; assigneeId: string | null; clientId: string | null }>;
  setUtmIfEmpty(dealId: string, utm: Record<string, string>): Promise<void>;
  /** Менеджер ответил — заявка из «Неразобранного» принята (и взята им, если была ничья); how — как именно, в ленту сделки. */
  acceptUnsorted(dealId: string, authorId: string, how?: string): Promise<void>;
  /**
   * Ответ с телефона магазина: новая заявка (неразобранная или на первом этапе) переходит к тому, у кого телефон.
   * claimed — теперь его (previous — кто вёл раньше); false — заявка уже в работе у другого, не трогаем.
   */
  claimNewLead?(dealId: string, userId: string, how: string): Promise<{ claimed: boolean; previous: string | null }>;
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
  site(): Promise<{ url: string; registrationOpen: boolean; themes: string[]; landings: string[]; themeLandings?: Record<string, string> }>;
  timeZone(): string;
  /** База знаний владельца («Интеграции» → AI-помощник): правила и ответы, которые AI-продажник знает наравне с тарифами. */
  knowledge(): Promise<string>;
  /** Название компании для приветствия и инструкции AI-продажника. */
  brand(): string;
  /** Уроки работы над ошибками (разбор бесед раз в сутки и правки владельца) — блок в инструкции продажника. */
  lessons?(): Promise<BotLesson[]>;
}

/** Беседы бота для ежедневного разбора ошибок. */
export interface BotCoachSource {
  /** Беседы, где бот писал клиенту начиная с since (новые сверху, не больше limit): итог, флаги журнала, переписка. */
  recent(since: Date, limit: number): Promise<CoachConversation[]>;
}

/** Где хранятся уроки и журнал разборов. */
export interface BotLessonStore {
  load(): Promise<{ lessons: BotLesson[]; log: CoachRun[] }>;
  save(lessons: BotLesson[], log: CoachRun[]): Promise<void>;
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
  stop(conversationId: string, reason: string, opts?: { soft?: boolean }): Promise<boolean>;
  /** Диалоги, где пора сделать ход. */
  due(now: Date, limit: number): Promise<string[]>;
  /** Входящие диалога начиная с момента since. */
  incoming(conversationId: string, since: Date): Promise<BotInput[]>;
  /** Журнал бота (метрики в настройках). */
  log(conversationId: string, dealId: string | null, lang: string | null, events: BotEvent[]): Promise<void>;
}

/** Что бот узнаёт о клиенте и сделке перед опросом (контексты Sales, Ordering, Authoring — через контейнер). */
export interface BotCrm {
  deal(dealId: string): Promise<{ orderId: string | null; paid: number; firstStage: boolean; closed: boolean; assigneeId: string | null; unsorted: boolean; customFields: Record<string, unknown>; contactName: string; title: string; clientId: string | null } | null>;
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

/**
 * Модель AI-продажника: отдельное подключение («Интеграции» → AI → «Модель продажника»), чтобы продающий бот мог работать
 * на более сильной модели, чем помощник менеджера. Ошибка модели — исключение; бот решает, повторить или позвать человека.
 */
export interface BotSellerModel {
  configured(): Promise<boolean>;
  /** Один запрос со схемой JSON-ответа; возвращает текст ответа модели. */
  complete(input: { system: string; user: string; schema: Record<string, unknown>; timeoutMs: number }): Promise<string>;
  /**
   * Распознать вложение (голосовое → расшифровка, фото → описание). { unsupported } — модель распознавания такое не умеет
   * (больше не пробовать в этой беседе); null — временный сбой.
   */
  media?(input: { system: string; parts: { kind: "image" | "audio"; data: string; mime: string }[]; timeoutMs: number }): Promise<{ text: string } | { unsupported: true; reason?: string } | null>;
}

/** Файл вложения по id сообщения — для распознавания голосовых и фото моделью продажника. */
export interface BotMediaReader {
  read(messageId: string): Promise<{ data: Uint8Array; mime: string } | null>;
}

/** Переписка диалога для AI-продажника: клиент, бот, менеджеры (без внутренних заметок). */
export interface BotHistory {
  messages(conversationId: string, limit: number): Promise<HistoryMessage[]>;
}

/** Счёт от имени бота (режим «Продаёт»): выпуск, счёт Kaspi на номер WhatsApp и текст счёта для клиента. */
export interface BotInvoices {
  /** error — счёт не выпущен (нет способа оплаты, сделка закрыта…): счёт выставит менеджер. */
  issue(input: { conversationId: string; dealId: string; plan: "hardcover" | "digital"; agreedTotal: number; amount: number; locale: BotLang; clientName: string; key: string }): Promise<{ label: string; amount: number; text: string } | { error: string }>;
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

/** Файлы, отправленные из CRM, у нас в хранилище (mediaUrl вида store:…). */
export interface ChatFileStore {
  owns(mediaUrl: string | null): boolean;
  save(conversationId: string, file: { data: Uint8Array; name: string; mime: string }): Promise<string>;
  read(mediaUrl: string): Promise<{ data: Uint8Array; mime: string } | null>;
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
