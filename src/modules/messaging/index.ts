import type { Clock, CustomFieldsReader, LiveFeed, SettingsStore, StaffNotifier, WorkSchedule } from "@/shared/application";
import { consoleLogger } from "@/shared/application";
import type { SmtpConfigSource } from "@/shared/infrastructure/mail";
import { ChatMediaService, MessagingService, QualifierBot, SiteChatService, type BotBrain, type BotCrm, type BotInvoices, type BotSellerModel, type IncomingRules, type LinkAttribution, type SalesGateway } from "./application";
import { channelTransport, crmBotSettings, crmNotifier, crmTasksAdapter, gowaMediaGateway, processTimers, realtimeUpdates, siteIds, whatsappTransport, widgetSettings, type BotSiteInfo, type MessagingPermission } from "./infrastructure/adapters";
import { ChatView } from "./infrastructure/chatView";
import { EmailChannel, type EmailSettingKey, type MailTransport } from "./infrastructure/email";
import { GOWA_PAGE_LIMIT, GowaClient, verifyGowaSignature, type GowaConfig, type GowaWebhook } from "./infrastructure/gowa";
import { GOWA_CHANNEL, gowaJid, parseGowaHistory } from "./domain/gowa";
import { WazzupClient } from "./infrastructure/wazzup";
import { DrizzleBotStore, DrizzleConversationRepository, DrizzleMessageRepository, DrizzleMessagingQueries, drizzleBlocklist } from "./infrastructure/persistence";
import { botPreview, botStatus, type BotPreviewInput } from "./application/botPreview";
import type { Conversation, HistoryMessage } from "./domain";

export { channelLabel, findSensitive, redactSecrets, sensitiveLabels, type Conversation, type InboundMessage, type SensitiveFinding } from "./domain";
export type { ChatMessage } from "./infrastructure/chatView";
export { WazzupError } from "./infrastructure/wazzup";
export { MediaUnavailableError } from "./application/media";
export { GowaError, type GowaConfig, type GowaStatus, type GowaWebhook } from "./infrastructure/gowa";
export type { Attachment, IngestExtra, SalesGateway as MessagingSalesGateway, IncomingRules, BotBrain, BotCrm, BotInvoices, BotSellerModel } from "./application";
export type { BotSiteInfo } from "./infrastructure/adapters";
export type { BotMetrics } from "./infrastructure/persistence";
export type { BotPreviewInput, BotPreviewResult, BotStatus } from "./application/botPreview";

/** Настройки CRM, которые читает и пишет переписка: бот, виджет, Wazzup и почтовый ящик. */
type MessagingSettingKey = "bot.mode" | "bot.config" | "crm.workHours" | "widget.enabled" | "widget.chat" | "wazzup.apiKey" | "wazzup.baseUrl" | "wazzup.channelId" | "gowa.historySyncedAt" | "ai.knowledge" | EmailSettingKey;

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
  private readonly botStore = new DrizzleBotStore();
  private readonly botSettings;

  constructor(
    private readonly deps: {
      clock: Clock;
      sales: SalesGateway;
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
    } & WorkspacePorts,
  ) {
    const conversations = new DrizzleConversationRepository();
    const notifier = crmNotifier(deps.notifier);
    const live = realtimeUpdates(deps.live);
    this.botSettings = crmBotSettings({ settings: deps.settings, schedule: deps.schedule, fields: deps.fields, site: deps.botSite });
    this.bot = new QualifierBot({
      conversations,
      store: this.botStore,
      settings: this.botSettings,
      crm: { ...deps.botCrm, priorChat: (conv, before) => this.priorChat(conv, before) },
      sales: deps.sales,
      notifier,
      tasks: crmTasksAdapter,
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
    });
    const bot = this.bot;
    this.gowa = new GowaClient(deps.whatsappSettings.gowa);
    this.wazzup = new WazzupClient(deps.settings);
    // Входящие письма уходят в сервис переписки, а он отправляет ответы через почту: ссылка на chats берётся при вызове.
    this.email = new EmailChannel({ ...deps, chats: { ingest: (message, extra) => this.chats.ingest(message, extra) } });
    this.view = new ChatView({ fields: deps.fields, settings: deps.settings, wazzup: this.wazzup, gowa: this.gowa, whatsappProvider: deps.whatsappSettings.provider, smtp: deps.smtp });
    const transport = whatsappTransport(this.gowa, deps.whatsappSettings.provider, channelTransport(this.wazzup, this.email));
    const messages = new DrizzleMessageRepository();
    this.chats = new MessagingService(conversations, messages, drizzleBlocklist, transport, deps.sales, deps.links, notifier, live, deps.rules, bot, deps.clock, consoleLogger("chats"), deps.whatsapp);
    this.media = new ChatMediaService(conversations, messages, gowaMediaGateway(this.gowa), async () => (await deps.whatsappSettings.provider()) === "gowa");
    this.site = new SiteChatService(this.chats, deps.sales, crmTasksAdapter, notifier, live, deps.clock, siteIds);
  }

  /** Переписка для AI-продажника: клиент, бот и менеджеры; внутренние заметки сотрудников модель не видит. */
  private async botHistory(conversationId: string, limit: number): Promise<HistoryMessage[]> {
    const all = await this.view.messages(conversationId, limit);
    return all
      .filter((m) => !m.internal)
      .map((m) => ({
        from: m.direction === "in" ? ("client" as const) : m.author === "бот" ? ("bot" as const) : ("manager" as const),
        text: m.text || (m.mediaUrl || m.gateway ? `[${m.type === "audio" ? "голосовое сообщение" : m.type === "image" ? "фото" : m.type === "document" ? "файл" : m.type === "video" ? "видео" : m.type}]` : ""),
        at: m.at,
        author: m.direction === "out" && m.author && m.author !== "бот" ? m.author : null,
      }));
  }

  /**
   * Личное сообщение на номер в WhatsApp — не диалог с клиентом, в CRM не записывается (напоминания сотруднику).
   * Через GOWA или, при Wazzup, через первый активный канал WhatsApp. false — не отправилось.
   */
  async sendToPhone(phone: string, text: string): Promise<boolean> {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) return false;
    try {
      if ((await this.deps.whatsappSettings.provider()) === "gowa") {
        await this.gowa.sendText(digits, text);
        return true;
      }
      const channel = (await this.wazzup.listChannels()).find((c) => c.transport === "whatsapp" && c.state === "active");
      if (!channel) return false;
      await this.wazzup.send({ channelId: channel.channelId, chatType: "whatsapp", chatId: digits, text, crmMessageId: crypto.randomUUID() });
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
    const [rec, fields] = await Promise.all([this.botStore.load(conversationId), this.deps.fields.list("deal")]);
    return botStatus(rec, fields);
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
