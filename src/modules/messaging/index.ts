import type { Clock, CustomFieldsReader, LiveFeed, SettingsStore, StaffNotifier, WorkSchedule } from "@/shared/application";
import { consoleLogger } from "@/shared/application";
import type { SmtpConfigSource } from "@/shared/infrastructure/mail";
import { MessagingService, QualifierBot, SiteChatService, type IncomingRules, type LinkAttribution, type SalesGateway } from "./application";
import { channelTransport, crmBotSettings, crmNotifier, crmTasksAdapter, realtimeUpdates, siteIds, whatsappTransport, widgetSettings, type MessagingPermission } from "./infrastructure/adapters";
import { ChatView } from "./infrastructure/chatView";
import { EmailChannel, type EmailSettingKey, type MailTransport } from "./infrastructure/email";
import { GowaClient, verifyGowaSignature, type GowaConfig, type GowaWebhook } from "./infrastructure/gowa";
import { WazzupClient } from "./infrastructure/wazzup";
import { DrizzleConversationRepository, DrizzleMessageRepository, DrizzleMessagingQueries, drizzleBlocklist } from "./infrastructure/persistence";

export { channelLabel, type Conversation, type InboundMessage } from "./domain";
export type { ChatMessage } from "./infrastructure/chatView";
export { WazzupError } from "./infrastructure/wazzup";
export { GowaError, type GowaConfig, type GowaStatus, type GowaWebhook } from "./infrastructure/gowa";
export type { IngestExtra, SalesGateway as MessagingSalesGateway, IncomingRules } from "./application";

/** Настройки CRM, которые читает и пишет переписка: бот, виджет, Wazzup и почтовый ящик. */
type MessagingSettingKey = "bot.mode" | "bot.config" | "widget.enabled" | "widget.chat" | "wazzup.apiKey" | "wazzup.baseUrl" | "wazzup.channelId" | EmailSettingKey;

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

  constructor(
    private readonly deps: { clock: Clock; sales: SalesGateway; rules: IncomingRules; links: LinkAttribution; whatsapp: () => Promise<string>; whatsappSettings: WhatsappSettings } & WorkspacePorts,
  ) {
    const conversations = new DrizzleConversationRepository();
    const notifier = crmNotifier(deps.notifier);
    const live = realtimeUpdates(deps.live);
    const bot = new QualifierBot(conversations, crmBotSettings(deps), deps.sales, notifier, deps.clock);
    this.gowa = new GowaClient(deps.whatsappSettings.gowa);
    this.wazzup = new WazzupClient(deps.settings);
    // Входящие письма уходят в сервис переписки, а он отправляет ответы через почту: ссылка на chats берётся при вызове.
    this.email = new EmailChannel({ ...deps, chats: { ingest: (message, extra) => this.chats.ingest(message, extra) } });
    this.view = new ChatView({ fields: deps.fields, settings: deps.settings, wazzup: this.wazzup, gowa: this.gowa, whatsappProvider: deps.whatsappSettings.provider, smtp: deps.smtp });
    const transport = whatsappTransport(this.gowa, deps.whatsappSettings.provider, channelTransport(this.wazzup, this.email));
    this.chats = new MessagingService(conversations, new DrizzleMessageRepository(), drizzleBlocklist, transport, deps.sales, deps.links, notifier, live, deps.rules, bot, deps.clock, consoleLogger("chats"));
    this.site = new SiteChatService(this.chats, deps.sales, crmTasksAdapter, notifier, live, deps.clock, siteIds);
  }

  /** Через что сейчас работает WhatsApp. */
  whatsappProvider() {
    return this.deps.whatsappSettings.provider();
  }

  /**
   * Завести в шлюзе устройство магазина и направить его события на сайт — при сохранении настроек и перед привязкой
   * номера. Ничего настраивать на стороне шлюза не нужно.
   */
  async connectGowa() {
    await this.gowa.connect(await this.deps.whatsappSettings.gowaWebhook());
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
