import type { Clock, CustomFieldsReader, LiveFeed, SettingsStore, StaffNotifier, WorkSchedule } from "@/shared/application";
import { consoleLogger } from "@/shared/application";
import type { SmtpConfigSource } from "@/shared/infrastructure/mail";
import { MessagingService, QualifierBot, SiteChatService, type IncomingRules, type LinkAttribution, type SalesGateway } from "./application";
import { channelTransport, crmBotSettings, crmNotifier, crmTasksAdapter, realtimeUpdates, siteIds, whatsappTransport, widgetSettings, type MessagingPermission } from "./infrastructure/adapters";
import { ChatView } from "./infrastructure/chatView";
import { EmailChannel, type EmailSettingKey, type MailTransport } from "./infrastructure/email";
import { GowaClient, verifyGowaSignature, type GowaConfig, type GowaWebhook } from "./infrastructure/gowa";
import { parseGowaHistory } from "./domain/gowa";
import { WazzupClient } from "./infrastructure/wazzup";
import { DrizzleConversationRepository, DrizzleMessageRepository, DrizzleMessagingQueries, drizzleBlocklist } from "./infrastructure/persistence";

export { channelLabel, type Conversation, type InboundMessage } from "./domain";
export type { ChatMessage } from "./infrastructure/chatView";
export { WazzupError } from "./infrastructure/wazzup";
export { GowaError, type GowaConfig, type GowaStatus, type GowaWebhook } from "./infrastructure/gowa";
export type { IngestExtra, SalesGateway as MessagingSalesGateway, IncomingRules } from "./application";

/** Настройки CRM, которые читает и пишет переписка: бот, виджет, Wazzup и почтовый ящик. */
type MessagingSettingKey = "bot.mode" | "bot.config" | "widget.enabled" | "widget.chat" | "wazzup.apiKey" | "wazzup.baseUrl" | "wazzup.channelId" | "gowa.historySyncedAt" | EmailSettingKey;

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

  /**
   * История переписки из шлюза GOWA (WhatsApp передаёт её при привязке номера): по всем личным чатам — в диалоги
   * со знакомыми номерами (клиент, открытая сделка или уже есть диалог). Незнакомые номера и спам пропускаются.
   */
  async importGowaHistory(opts: { since?: Date } = {}): Promise<{ chats: number; withClients: number; imported: number }> {
    const PAGE = 200;
    let offset = 0;
    let chats = 0;
    let withClients = 0;
    let imported = 0;
    for (;;) {
      const page = await this.gowa.chats(offset, 100);
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
      offset += 100;
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
