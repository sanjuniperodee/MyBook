import type { Clock, CustomFieldsReader, LiveFeed, SettingsStore, StaffNotifier, WorkSchedule } from "@/shared/application";
import { consoleLogger } from "@/shared/application";
import type { SmtpConfigSource } from "@/shared/infrastructure/mail";
import { BotCoach, ChatMediaService, MessageActionError, MessagingService, QualifierBot, SELLER_MEDIA_PROMPT, SiteChatService, type AnsweredTasks, type BotBrain, type BotCrm, type BotInvoices, type BotSellerModel, type IncomingRules, type LinkAttribution, type SalesGateway, type Tasks } from "./application";
import { channelTransport, crmBotSettings, crmNotifier, gowaMediaGateway, processTimers, realtimeUpdates, siteIds, whatsappTransport, widgetSettings, type BotSiteInfo, type MessagingPermission } from "./infrastructure/adapters";
import { ChatView } from "./infrastructure/chatView";
import { EmailChannel, type EmailSettingKey, type MailTransport } from "./infrastructure/email";
import { GOWA_PAGE_LIMIT, GowaClient, verifyGowaSignature, type GowaConfig, type GowaWebhook } from "./infrastructure/gowa";
import { GOWA_CHANNEL, gowaCatchUpRange, gowaJid, isGowaPersonalJid, parseGowaHistory } from "./domain/gowa";
import { WazzupClient } from "./infrastructure/wazzup";
import { drizzleCoachSource } from "./infrastructure/botCoach";
import { chatFiles } from "./infrastructure/chatFiles";
import { staffLine } from "./infrastructure/staffLine";
import { MATERIAL_MAX_BYTES, MAX_MATERIALS, mediaLine, parseCoachLog, parseLessons, parseMaterials, type BotLesson, type BotMaterial, type CoachRun, type MaterialKind, type MaterialLang } from "./domain";
import { getFile, putFile } from "@/shared/infrastructure/storage";
import { DrizzleBotStore, DrizzleConversationRepository, DrizzleMessageRepository, DrizzleMessagingQueries, drizzleBlocklist, purgeBotTraces } from "./infrastructure/persistence";
import { botPreview, botStatus, type BotPreviewInput } from "./application/botPreview";
import { contactPhone, parseRuleSending, type Conversation, type HistoryMessage, type InboundMessage } from "./domain";
import { normalizePhone } from "@/shared/domain/phone";

export { MATERIAL_MAX_BYTES, MAX_MATERIALS, materialsSummary, type BotMaterial, type MaterialKind, type MaterialLang } from "./domain";
export { DEFAULT_RULE_SENDING, RULE_DAILY_LIMIT_MAX, type RuleSendingPolicy } from "./domain";
export type { BotTurnTrace } from "./domain";
export { channelLabel, findSensitive, redactSecrets, sensitiveLabels, sensitiveWhat, type Conversation, type InboundMessage, type SensitiveFinding } from "./domain";
export type { ChatMessage } from "./infrastructure/chatView";
export { WazzupError } from "./infrastructure/wazzup";
export { MediaUnavailableError } from "./application/media";
export { EDIT_WINDOW_MS, MessageActionError, REVOKE_WINDOW_MS } from "./application/services";
export { GowaError, type GowaConfig, type GowaStatus, type GowaWebhook } from "./infrastructure/gowa";
export type { Attachment, BlockReason, ContactsTarget, IngestExtra, SalesGateway as MessagingSalesGateway, IncomingRules, BotBrain, BotCrm, BotInvoices, BotSellerModel } from "./application";
export type { BotSiteInfo } from "./infrastructure/adapters";
export type { BotMetrics } from "./infrastructure/persistence";
export type { BotPreviewInput, BotPreviewResult, BotStatus } from "./application/botPreview";

/** Настройки CRM, которые читает и пишет переписка: бот, виджет, Wazzup и почтовый ящик. */
type MessagingSettingKey = "bot.mode" | "bot.config" | "bot.humanHold" | "bot.humanNight" | "bot.lessons" | "bot.coach" | "bot.materials" | "whatsapp.phoneHolder" | "whatsapp.rulesWindow" | "whatsapp.rulesDailyLimit" | "crm.workHours" | "widget.enabled" | "widget.chat" | "wazzup.apiKey" | "wazzup.baseUrl" | "wazzup.channelId" | "gowa.historySyncedAt" | "ai.knowledge" | EmailSettingKey;

/** Порты рабочего пространства и почты: настройки, уведомления, живое обновление, график, свои поля, SMTP. */
interface WorkspacePorts {
  settings: SettingsStore<MessagingSettingKey>;
  notifier: StaffNotifier<MessagingPermission>;
  live: LiveFeed;
  schedule: WorkSchedule;
  fields: CustomFieldsReader;
  /** Настройки SMTP: свой адрес отправителя — чтобы не принять копию своего письма за входящее. */
  smtpConfig: SmtpConfigSource;
  /** SMTP-клиент: ответы и письма менеджеров из CRM (нужны Message-ID и цепочки), проверка «почта настроена». */
  smtp: MailTransport;
}

/** Через что работает WhatsApp и настройки своего шлюза GOWA («Интеграции»). */
export interface WhatsappSettings {
  provider(): Promise<"wazzup" | "gowa">;
  gowa(): Promise<GowaConfig>;
  /** Адрес вебхука на сайте и секрет подписи (создаётся при первом обращении) — их сайт передаёт шлюзу сам. */
  gowaWebhook(): Promise<GowaWebhook>;
}

/** Вложения, которые пересылаются файлом. */
const FORWARD_MEDIA = new Set(["image", "video", "audio", "document"]);
/** Больше WhatsApp не примет (видео до 64 МБ, документы до 100 МБ; берём с запасом по памяти сервера). */
const MAX_UPLOAD = 50 * 1024 * 1024;

/** Как отправить файл в WhatsApp — по типу и имени. */
export function fileKind(mime: string, name: string): "image" | "video" | "audio" | "document" {
  const m = mime.toLowerCase();
  if (/^image\/(?:jpeg|png|webp)$/.test(m) || /\.(jpe?g|png|webp)$/i.test(name)) return "image";
  if (/^video\/(?:mp4|3gpp|quicktime)$/.test(m) || /\.(mp4|mov|3gp)$/i.test(name)) return "video";
  if (m.startsWith("audio/") || /\.(ogg|opus|mp3|m4a|aac|wav)$/i.test(name)) return "audio";
  return "document";
}

/** Cookie посетителя для чата на сайте. */
export const VISITOR_COOKIE = "mb_chat";

/** Публичный фасад контекста «Переписка»: единый инбокс, бот-квалификатор, виджет на сайте. */
export class MessagingModule {
  readonly chats: MessagingService;
  readonly site: SiteChatService;
  readonly queries = new DrizzleMessagingQueries();
  /** Свой шлюз WhatsApp (GOWA): привязка номера, состояние, вложения. */
  readonly gowa: GowaClient;
  /** WhatsApp через Wazzup: каналы, подписка на вебхуки. */
  readonly wazzup: WazzupClient;
  /** Почта как канал: письма из карточки, входящие по IMAP и вебхуком. */
  readonly email: EmailChannel;
  /** Данные экрана чата. */
  readonly view: ChatView;
  /** Вложения WhatsApp по id сообщения: голосовые, фото, файлы (в том числе из истории — шлюз скачивает их по запросу). */
  readonly media: ChatMediaService;
  /** Бот-квалификатор: ходы, фоновый проход, остановка и запуск из чата. */
  readonly bot: QualifierBot;
  /** Работа над ошибками AI-продажника: ночной разбор бесед → уроки в его инструкции. */
  readonly coach: BotCoach;
  private readonly botStore = new DrizzleBotStore();
  private readonly messages = new DrizzleMessageRepository();
  private readonly botSettings;
  /** Номера сотрудников и что CRM отправила им сама (напоминания): эхо и ответы не становятся заявками. */
  private readonly staffLine: ReturnType<typeof staffLine>;

  constructor(
    private readonly deps: {
      clock: Clock;
      sales: SalesGateway;
      /** Задачи менеджерам (бот, «Перезвоните мне») и закрытие задач «ответить» ответом — сервис задач контекста Clients. */
      tasks: Tasks & AnsweredTasks;
      rules: IncomingRules;
      links: LinkAttribution;
      whatsapp: () => Promise<string>;
      whatsappSettings: WhatsappSettings;
      /** Бот: сделка и клиент (Sales, Ordering, Authoring), цены и темы с сайта, AI для понимания ответов — порты контейнера. */
      botCrm: Omit<BotCrm, "priorChat">;
      botSite: BotSiteInfo;
      brain?: BotBrain | null;
      /** Счёт от имени бота (Ordering) — режим «Продаёт» со счётом. */
      botInvoices?: BotInvoices | null;
      /** Модель AI-продажника (Assistant): без неё режим «Продаёт» работает по шаблонам. */
      sellerModel?: BotSellerModel | null;
      /** Номера действующих сотрудников (Access): переписка с ними — служебная, не заявки. */
      staffPhones?: () => Promise<string[]>;
    } & WorkspacePorts,
  ) {
    const conversations = new DrizzleConversationRepository();
    const notifier = crmNotifier(deps.notifier);
    this.staffLine = staffLine(deps.staffPhones ?? (async () => []));
    const live = realtimeUpdates(deps.live);
    this.botSettings = crmBotSettings({ settings: deps.settings, schedule: deps.schedule, fields: deps.fields, site: deps.botSite });
    this.bot = new QualifierBot({
      conversations,
      store: this.botStore,
      settings: this.botSettings,
      crm: { ...deps.botCrm, priorChat: (conv, before) => this.priorChat(conv, before) },
      sales: deps.sales,
      notifier,
      tasks: deps.tasks,
      timers: processTimers(),
      clock: deps.clock,
      logger: consoleLogger("bot"),
      // Ссылки на chats берутся при вызове: сервис переписки создаётся ниже.
      send: (conversationId, text) => this.chats.send(conversationId, text, null, "bot"),
      note: (conversationId, text) => this.chats.addInternalNote(conversationId, text, null, "bot"),
      shopPhone: deps.whatsapp,
      brain: deps.brain ?? null,
      invoices: deps.botInvoices ?? null,
      seller: deps.sellerModel ?? null,
      history: (conversationId, limit) => this.botHistory(conversationId, limit),
      media: (messageId) => this.media.bytes(messageId).catch(() => null),
      // Расшифровки голосовых, сделанные продажником, видны и менеджеру в чате.
      transcript: (messageId, text) => this.messages.setTranscript(messageId, text),
      changed: (conversationId) => live.chatChanged(conversationId),
      // Стоп-лист «Не писать первым»: бот отвечает клиенту, но не напоминает о себе.
      noMarketing: (conv) => this.chats.noMarketing(conv.chatId, contactPhone(conv)),
      materials: {
        list: () => this.materials(),
        send: async (conversationId, m) => {
          const data = await getFile(m.key).catch(() => null);
          if (!data) return false;
          return this.chats.sendBotFile(conversationId, { data: new Uint8Array(data), name: m.name, mime: m.mime, kind: m.kind }, m.caption, `store:${m.key}`);
        },
      },
    });
    this.coach = new BotCoach({
      settings: this.botSettings,
      seller: deps.sellerModel ?? null,
      source: drizzleCoachSource,
      store: { load: () => this.lessons(), save: (lessons, log) => deps.settings.save({ "bot.lessons": JSON.stringify(lessons), "bot.coach": JSON.stringify(log) }, null) },
      clock: deps.clock,
      logger: consoleLogger("bot-coach"),
      newId: () => crypto.randomUUID().slice(0, 8),
    });
    const bot = this.bot;
    this.gowa = new GowaClient(deps.whatsappSettings.gowa);
    this.wazzup = new WazzupClient(deps.settings);
    // Входящие письма уходят в сервис переписки, а он отправляет ответы через почту: ссылка на chats берётся при вызове.
    this.email = new EmailChannel({ ...deps, chats: { ingest: (message, extra) => this.chats.ingest(message, extra) } });
    this.view = new ChatView({ fields: deps.fields, settings: deps.settings, wazzup: this.wazzup, gowa: this.gowa, whatsappProvider: deps.whatsappSettings.provider, smtp: deps.smtp });
    const transport = whatsappTransport(this.gowa, deps.whatsappSettings.provider, channelTransport(this.wazzup, this.email));
    const messages = this.messages;
    // Окно и суточный лимит сообщений от правил — настройки «Интеграции» → «Мессенджеры» (кэш настроек — 10 секунд).
    const ruleSending = async () => parseRuleSending(await deps.settings.get("whatsapp.rulesWindow"), await deps.settings.get("whatsapp.rulesDailyLimit"));
    this.chats = new MessagingService(conversations, messages, drizzleBlocklist, transport, deps.sales, deps.links, notifier, live, deps.rules, bot, deps.clock, consoleLogger("chats"), deps.whatsapp, () => this.phoneHolder(), ruleSending, this.staffLine, deps.tasks);
    this.media = new ChatMediaService(conversations, messages, gowaMediaGateway(this.gowa), async () => (await deps.whatsappSettings.provider()) === "gowa", Date.now, chatFiles);
    this.site = new SiteChatService(this.chats, deps.sales, deps.tasks, notifier, live, deps.clock, siteIds, deps.schedule);
  }

  /** Файл от сотрудника (фото, видео, аудио, документ): сохраняется у нас (чтобы открыть в CRM) и уходит клиенту. */
  async sendUpload(conversationId: string, file: { data: Uint8Array; name: string; mime: string }, caption: string, authorId: string, opts: { replyToId?: string | null } = {}) {
    if (!file.data.length) throw new MessageActionError("Пустой файл");
    if (file.data.length > MAX_UPLOAD) throw new MessageActionError("Файл больше 50 МБ — WhatsApp такой не примет");
    const mediaUrl = await chatFiles.save(conversationId, file);
    return this.chats.sendFile(conversationId, { ...file, kind: fileKind(file.mime, file.name) }, caption, authorId, { mediaUrl, replyToId: opts.replyToId });
  }

  /**
   * Переслать сообщение в другие диалоги (до 10): текст — текстом, вложение — тем же файлом с подписью; в WhatsApp
   * с пометкой «Пересланное». В тексте или подписи чужой для получателя номер, карта, IBAN или ссылка на перевод Kaspi
   * (например, номер другого клиента) — не уходит никуда (chats-d4); номер самого получателя и магазина — можно.
   * Возвращает, куда не ушло и почему.
   */
  async forward(messageId: string, targetIds: string[], authorId: string): Promise<{ sent: number; failed: { conversationId: string; error: string }[] }> {
    const m = await this.messages.findOne(messageId);
    if (!m || m.deletedAt) throw new MessageActionError("Сообщение не найдено");
    if (m.internal) throw new MessageActionError("Заметку для коллег переслать нельзя");
    const media = FORWARD_MEDIA.has(m.type);
    let file: { data: Uint8Array; name: string; mime: string; kind: ReturnType<typeof fileKind> } | null = null;
    let mediaUrl: string | null = null;
    if (media) {
      const bytes = await this.media.bytes(m.id).catch(() => null);
      if (!bytes) throw new MessageActionError("Файл вложения недоступен — переслать не получится");
      const kind = m.type === "image" || m.type === "video" || m.type === "audio" ? m.type : "document";
      file = { data: bytes.data, mime: bytes.mime, kind, name: `${kind === "document" ? "file" : kind}.${(bytes.mime.split("/")[1] ?? "bin").split(";")[0]}` };
      // Шлюз мог только что скачать файл — копия ссылается на тот же файл.
      mediaUrl = (await this.messages.findOne(m.id))?.mediaUrl ?? null;
    } else if (!m.text.trim()) throw new MessageActionError("Пустое сообщение");
    const targets = [...new Set(targetIds)].slice(0, 10);
    // Реквизиты в тексте или подписи — до отправки хоть кому-то.
    await this.chats.assertForwardable(m.text, targets);
    const failed: { conversationId: string; error: string }[] = [];
    let sent = 0;
    for (const target of targets) {
      try {
        const r = file ? await this.chats.sendFile(target, file, m.text, authorId, { mediaUrl, forwarded: true }) : await this.chats.send(target, m.text, authorId, undefined, { forwarded: true });
        if (r.status === "error") failed.push({ conversationId: target, error: r.error ?? "не отправилось" });
        else sent++;
      } catch (err) {
        failed.push({ conversationId: target, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return { sent, failed };
  }

  /** Расшифровка голосового (по кнопке в чате): модель «Голосовые и фото»; готовая — из базы. */
  async transcribe(messageId: string): Promise<string> {
    const m = await this.messages.findOne(messageId);
    if (!m || m.type !== "audio") throw new MessageActionError("Это не голосовое");
    if (m.transcript) return m.transcript;
    const model = this.deps.sellerModel;
    if (!model?.media) throw new MessageActionError("Модель для голосовых не подключена («Интеграции» → AI → «Голосовые и фото»)");
    const bytes = await this.media.bytes(m.id).catch(() => null);
    if (!bytes) throw new MessageActionError("Файл голосового недоступен");
    const res = await model.media({ system: SELLER_MEDIA_PROMPT.audio, parts: [{ kind: "audio", data: Buffer.from(bytes.data).toString("base64"), mime: bytes.mime || "audio/ogg" }], timeoutMs: 60_000 }).catch(() => null);
    if (!res) throw new MessageActionError("Не удалось расшифровать — попробуйте ещё раз");
    if ("unsupported" in res) throw new MessageActionError(`Не расшифровать: ${res.reason ?? "модель не слушает голосовые"}. «Интеграции» → AI → «Голосовые и фото»`);
    const text = res.text.trim().slice(0, 4000) || "(неразборчиво)";
    await this.messages.setTranscript(m.id, text);
    return text;
  }

  /** У кого сейчас телефон WhatsApp магазина: его ответы с телефона забирают новые заявки. */
  async phoneHolder(): Promise<{ id: string; name: string } | null> {
    const raw = await this.deps.settings.get("whatsapp.phoneHolder");
    try {
      const v = raw ? (JSON.parse(raw) as { id?: string; name?: string }) : null;
      return v?.id ? { id: v.id, name: v.name ?? "" } : null;
    } catch {
      return null;
    }
  }

  async setPhoneHolder(holder: { id: string; name: string } | null, actorId: string) {
    await this.deps.settings.save({ "whatsapp.phoneHolder": holder ? JSON.stringify(holder) : "" }, actorId);
  }

  /** Уроки работы над ошибками и журнал разборов (для настроек и разбора). */
  /** Подборка материалов для клиента (настройки бота → «Продажи» → «Материалы»). */
  async materials(): Promise<BotMaterial[]> {
    return parseMaterials(await this.deps.settings.get("bot.materials"));
  }

  async saveMaterials(list: BotMaterial[], actorId: string) {
    await this.deps.settings.save({ "bot.materials": JSON.stringify(list.slice(0, MAX_MATERIALS)) }, actorId);
  }

  /**
   * Новый файл в подборку: фото, видео или документ (голосовые — нет), не больше лимита WhatsApp. Файл — в хранилище
   * bot-media/, запись — в конец подборки.
   */
  async addMaterial(file: { data: Uint8Array; name: string; mime: string }, meta: { caption: string; lang: MaterialLang; about: string }, actorId: string): Promise<BotMaterial> {
    const list = await this.materials();
    if (list.length >= MAX_MATERIALS) throw new MessageActionError(`В подборке уже ${MAX_MATERIALS} файлов — удалите лишний`);
    const found = fileKind(file.mime, file.name);
    if (found === "audio") throw new MessageActionError("Голосовые в подборку не добавляются — только фото, видео и документы");
    const kind: MaterialKind = found;
    if (!file.data.length) throw new MessageActionError("Пустой файл");
    if (file.data.length > MATERIAL_MAX_BYTES[kind]) throw new MessageActionError(`Файл больше ${Math.round(MATERIAL_MAX_BYTES[kind] / 1024 / 1024)} МБ — WhatsApp такой может не принять`);
    const ext = (/\.([a-z0-9]{1,5})$/i.exec(file.name)?.[1] ?? file.mime.split("/")[1] ?? "bin").toLowerCase().replace("jpeg", "jpg").replace(/^(jfif|pjpeg)$/, "jpg").replace("quicktime", "mov").replace(/^f4v$/, "mp4");
    const id = crypto.randomUUID();
    const key = `bot-media/${id}.${ext}`;
    await putFile(key, file.data);
    const name = file.name.replace(/[\\/]/g, "_").slice(0, 120) || `file.${ext}`;
    const m: BotMaterial = { id: id.slice(0, 8), kind, key, name, mime: file.mime || "application/octet-stream", size: file.data.length, caption: meta.caption.trim().slice(0, 300), lang: meta.lang, about: meta.about.trim().slice(0, 200), on: true };
    await this.saveMaterials([...list, m], actorId);
    return m;
  }

  /** Файл подборки (превью в настройках); null — нет такого. */
  async materialFile(id: string): Promise<{ data: Uint8Array; material: BotMaterial } | null> {
    const m = (await this.materials()).find((x) => x.id === id);
    const data = m ? await getFile(m.key).catch(() => null) : null;
    return m && data ? { data: new Uint8Array(data), material: m } : null;
  }

  /** Убрать файл из подборки. Сам файл остаётся в хранилище: на него ссылаются уже отправленные клиентам сообщения. */
  async removeMaterial(id: string, actorId: string) {
    const list = await this.materials();
    const m = list.find((x) => x.id === id);
    if (!m) return;
    await this.saveMaterials(
      list.filter((x) => x.id !== id),
      actorId,
    );
  }

  async lessons(): Promise<{ lessons: BotLesson[]; log: CoachRun[] }> {
    const v = await this.deps.settings.getMany(["bot.lessons", "bot.coach"]);
    return { lessons: parseLessons(v["bot.lessons"]), log: parseCoachLog(v["bot.coach"]) };
  }

  /** Владелец правит уроки в настройках: удалить, добавить свой (проверка — как у уроков разбора). */
  async saveLessons(lessons: BotLesson[], actorId: string) {
    await this.deps.settings.save({ "bot.lessons": JSON.stringify(lessons) }, actorId);
  }

  /** Переписка для AI-продажника: клиент, бот и менеджеры; внутренние заметки сотрудников модель не видит. */
  private async botHistory(conversationId: string, limit: number): Promise<HistoryMessage[]> {
    const all = await this.view.messages(conversationId, limit);
    return all
      .filter((m) => !m.internal && !m.deleted)
      .map((m) => ({
        from: m.direction === "in" ? ("client" as const) : m.author === "бот" ? ("bot" as const) : ("manager" as const),
        // Голосовое уже расшифровано (кнопкой в чате или ботом) — модель видит слова клиента, а не заглушку.
        text:
          m.type === "audio" && m.transcript
            ? mediaLine("audio", m.transcript)
            : m.text && !/^(?:🎤 Голосовое сообщение|📷 Фото|🎬 Видео|📎 Файл)$/.test(m.text.trim())
              ? m.text
              : m.mediaUrl || m.gateway || m.type !== "text"
                ? `[${m.type === "audio" ? "голосовое сообщение" : m.type === "image" ? "фото" : m.type === "document" ? "файл" : m.type === "video" ? "видео" : m.type}]`
                : "",
        type: m.type,
        at: m.at,
        author: m.direction === "out" && m.author && m.author !== "бот" ? m.author : null,
        id: m.id,
      }));
  }

  /**
   * Личное сообщение на номер в WhatsApp — не диалог с клиентом, в CRM не записывается (напоминания сотруднику).
   * Через GOWA или, при Wazzup, через первый активный канал WhatsApp. false — не отправилось. Текст и id запоминаются:
   * эхо с номера магазина не заводит диалог с сотрудником (tasks-d5).
   */
  async sendToPhone(phone: string, text: string): Promise<boolean> {
    const digits = normalizePhone(phone);
    if (digits.length < 10) return false;
    // До отправки: эхо шлюза может прийти раньше ответа на запрос.
    this.staffLine.remember({ text });
    try {
      if ((await this.deps.whatsappSettings.provider()) === "gowa") {
        this.staffLine.remember({ externalId: await this.gowa.sendText(digits, text), text });
        return true;
      }
      const channel = (await this.wazzup.listChannels()).find((c) => c.transport === "whatsapp" && c.state === "active");
      if (!channel) return false;
      const crmMessageId = crypto.randomUUID();
      this.staffLine.remember({ externalId: crmMessageId, text });
      this.staffLine.remember({ externalId: await this.wazzup.send({ channelId: channel.channelId, chatType: "whatsapp", chatId: digits, text, crmMessageId }), text });
      return true;
    } catch (err) {
      console.error("[messaging] sendToPhone", err);
      return false;
    }
  }

  /** Через что сейчас работает WhatsApp. */
  whatsappProvider() {
    return this.deps.whatsappSettings.provider();
  }

  /**
   * Переписка с номером была до CRM: в хранилище шлюза WhatsApp есть сообщения старше первого сообщения диалога.
   * Тогда это не новый клиент — бот молчит, а история попадает в диалог, чтобы менеджер видел, о чём говорили.
   */
  private async priorChat(conv: Conversation, before: Date): Promise<boolean> {
    if (conv.channel !== "whatsapp") return false;
    if (conv.channelId !== GOWA_CHANNEL && (await this.deps.whatsappSettings.provider()) !== "gowa") return false;
    const page = await this.gowa.chatMessages(gowaJid(conv.chatId), 0, 30);
    const older = page.messages
      .flatMap((raw) => parseGowaHistory(raw) ?? [])
      .filter((m) => m.at.getTime() < before.getTime() - 60_000)
      .sort((a, b) => a.at.getTime() - b.at.getTime());
    if (!older.length) return false;
    await this.chats.importHistory(older, { anyWhatsappChannel: true }).catch((err) => console.error("[bot] history", err));
    return true;
  }

  /** Состояние бота в диалоге — для шапки чата («Бот: вопрос 2 из 4», «Бот передал менеджеру»). */
  async botStatus(conversationId: string) {
    const now = this.deps.clock.now();
    const [rec, fields, workTime, humanNight, humanHold, mode] = await Promise.all([
      this.botStore.load(conversationId),
      this.deps.fields.list("deal"),
      this.botSettings.isWorkTime(now),
      this.botSettings.humanNight?.() ?? true,
      this.botSettings.humanHold?.() ?? true,
      this.botSettings.mode(),
    ]);
    return botStatus(rec, fields, now, { workTime, humanNight, humanHold, botOff: mode === "off" });
  }

  /** Тест-режим в настройках: прогнать диалог с несохранёнными настройками — без базы и без отправки клиенту. */
  async previewBot(input: BotPreviewInput) {
    const now = this.deps.clock.now();
    const [fields, catalog, site, nowWork, tomorrowStart] = await Promise.all([
      this.deps.fields.list("deal"),
      this.botSettings.catalog(),
      this.botSettings.site(),
      this.botSettings.nextWorkStart(now),
      this.botSettings.nextWorkStart(new Date(now.getTime() + 24 * 3600_000 - ((now.getTime() / 60_000) % (24 * 60)) * 60_000)),
    ]);
    // «Нерабочее время» в тесте — как ночью: менеджер ответит со следующей смены.
    const nextStart = input.workTime ? nowWork : tomorrowStart;
    const ctx = { fields, catalog, site, now, nextWorkStart: nextStart, tz: this.botSettings.timeZone() };
    // Продажник на AI — настоящий диалог с моделью; иначе (или без модели) — шаблонный ход.
    return (await this.bot.previewAi(input, ctx)) ?? { ...botPreview(input, ctx), engine: "template" as const };
  }

  /** Метрики бота для настроек. */
  botMetrics(days = 30) {
    return this.queries.botMetrics(days);
  }

  /** След хода продажника у сообщения бота («Почему так?» в чате); null — следа нет. */
  botTrace(messageId: string) {
    return this.queries.botTrace(messageId);
  }

  /** Медленный проход планировщика: следы ходов бота старше 90 дней удаляются порциями. */
  purgeBotTraces() {
    return purgeBotTraces();
  }

  /**
   * Завести в шлюзе устройство магазина и направить его события на сайт — при сохранении настроек и перед привязкой
   * номера. Ничего настраивать на стороне шлюза не нужно.
   */
  async connectGowa() {
    await this.gowa.connect(await this.deps.whatsappSettings.gowaWebhook());
  }

  /**
   * История переписки из шлюза GOWA (WhatsApp передаёт её при привязке номера): по всем личным чатам — в диалоги
   * со знакомыми номерами (клиент, открытая сделка или уже есть диалог). Незнакомые номера и спам пропускаются.
   */
  async importGowaHistory(opts: { since?: Date } = {}): Promise<{ chats: number; withClients: number; imported: number }> {
    const PAGE = GOWA_PAGE_LIMIT;
    let offset = 0;
    let chats = 0;
    let withClients = 0;
    let imported = 0;
    for (;;) {
      const page = await this.gowa.chats(offset, PAGE);
      for (const { jid, updatedAt } of page.chats) {
        // Повторный проход — только чаты, в которые с прошлого раза что-то пришло (новое или догруженная WhatsApp история).
        if (opts.since && updatedAt && new Date(updatedAt) < opts.since) continue;
        const all = [];
        for (let o = 0; ; o += PAGE) {
          const part = await this.gowa.chatMessages(jid, o, PAGE);
          all.push(...part.messages);
          if (!part.messages.length || o + PAGE >= part.total) break;
        }
        const messages = all.flatMap((raw) => parseGowaHistory(raw) ?? []).sort((a, b) => a.at.getTime() - b.at.getTime());
        if (!messages.length) continue;
        chats++;
        const r = await this.chats.importHistory(messages, { anyWhatsappChannel: true });
        if (r.skipped === null) withClients++;
        imported += r.imported;
      }
      offset += PAGE;
      if (!page.chats.length || offset >= page.total) break;
    }
    return { chats, withClients, imported };
  }

  /**
   * Фоновая загрузка истории из шлюза (планировщик): только если WhatsApp идёт через свой шлюз и номер привязан;
   * берёт чаты, обновившиеся с прошлого прохода, — так в CRM попадает и история, которую WhatsApp догружает позже.
   */
  async syncGowaHistory(): Promise<number> {
    if ((await this.deps.whatsappSettings.provider()) !== "gowa") return 0;
    const status = await this.gowa.status();
    if (!status.loggedIn) return 0;
    const started = new Date();
    const last = (await this.deps.settings.getMany(["gowa.historySyncedAt"]))["gowa.historySyncedAt"];
    const since = last && !Number.isNaN(Date.parse(last)) ? new Date(Date.parse(last) - 5 * 60_000) : undefined;
    const r = await this.importGowaHistory({ since });
    await this.deps.settings.save({ "gowa.historySyncedAt": started.toISOString() }, null);
    return r.imported;
  }

  /** Первая сверка со шлюзом в этом процессе смотрит дальше назад: сайт мог не работать. */
  #caughtUpOnce = false;

  /**
   * Сверка CRM со шлюзом (планировщик, раз в 30 с): что пришло на номер магазина или ушло с его телефона, но не дошло
   * вебхуком, — проходит обычным путём (gowaCatchUpRange). Чаты шлюза идут от недавних к старым: дальше окна не читаем.
   */
  async catchUpGowa(): Promise<number> {
    if ((await this.deps.whatsappSettings.provider()) !== "gowa") return 0;
    const { from, to } = gowaCatchUpRange(this.deps.clock.now(), !this.#caughtUpOnce);
    const PAGE = 50;
    let caught = 0;
    for (let offset = 0; offset < 10 * PAGE; offset += PAGE) {
      const page = await this.gowa.chats(offset, PAGE);
      let older = false;
      for (const { jid, lastMessageAt } of page.chats) {
        const last = Date.parse(lastMessageAt);
        if (!Number.isNaN(last) && last < from.getTime()) {
          older = true;
          break;
        }
        if (!isGowaPersonalJid(jid)) continue;
        caught += await this.chats.catchUp(await this.recentGowaMessages(jid, from, to), { anyWhatsappChannel: true });
      }
      if (older || page.chats.length < PAGE || offset + PAGE >= page.total) break;
    }
    this.#caughtUpOnce = true;
    return caught;
  }

  /** Сообщения собеседника из хранилища шлюза за окно сверки (шлюз отдаёт новые первыми). */
  private async recentGowaMessages(jid: string, from: Date, to: Date): Promise<InboundMessage[]> {
    const PAGE = 50;
    const out: InboundMessage[] = [];
    for (let offset = 0; offset < 10 * PAGE; offset += PAGE) {
      const part = await this.gowa.chatMessages(jid, offset, PAGE);
      let oldest = Number.POSITIVE_INFINITY;
      for (const raw of part.messages) {
        const at = Date.parse(String((raw as { timestamp?: unknown } | null)?.timestamp ?? ""));
        if (!Number.isNaN(at)) oldest = Math.min(oldest, at);
        const m = parseGowaHistory(raw);
        if (m && m.at >= from && m.at <= to) out.push(m);
      }
      if (part.messages.length < PAGE || oldest < from.getTime() || offset + PAGE >= part.total) break;
    }
    return out;
  }

  /** Подпись вебхука GOWA. */
  async verifyGowaWebhook(rawBody: string, signature: string | null) {
    return verifyGowaSignature(rawBody, signature, (await this.deps.whatsappSettings.gowaWebhook()).secret);
  }

  /** Настройки виджета на сайте (кнопка WhatsApp, онлайн-чат). */
  widgetConfig() {
    return widgetSettings(this.deps.settings, this.deps.whatsapp);
  }

  /** Переписка посетителя для виджета. */
  siteMessages(token: string, after?: Date) {
    return this.queries.siteMessages(this.site.chatIdOf(token), after);
  }
}
