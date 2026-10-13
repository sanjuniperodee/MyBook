import type { Clock } from "@/shared/application";
import { consoleLogger } from "@/shared/application";
import { MessagingService, QualifierBot, SiteChatService, type IncomingRules, type LinkAttribution, type SalesGateway } from "./application";
import { crmBotSettings, crmNotifier, crmTasksAdapter, realtimeUpdates, siteIds, whatsappTransport, widgetSettings } from "./infrastructure/adapters";
import { GowaClient, verifyGowaSignature, type GowaConfig, type GowaWebhook } from "./infrastructure/gowa";
import { DrizzleConversationRepository, DrizzleMessageRepository, DrizzleMessagingQueries, drizzleBlocklist } from "./infrastructure/persistence";

export { channelLabel, channelLabels, type Conversation, type InboundMessage } from "./domain";
export { loadChatMessages, listTemplates, chatVars, sendBlocker } from "./infrastructure/chatView";
export { listChannels, registerWebhook, wazzupConfigured, WazzupError } from "./infrastructure/wazzup";
export { GOWA_DEVICE, GowaError, type GowaConfig, type GowaStatus, type GowaWebhook } from "./infrastructure/gowa";
export { ingestEmail, sendEmailToContact, testImap, pollImap } from "./infrastructure/email";
export type { IngestExtra, SalesGateway as MessagingSalesGateway, IncomingRules } from "./application";

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

  constructor(private readonly deps: { clock: Clock; sales: SalesGateway; rules: IncomingRules; links: LinkAttribution; whatsapp: () => Promise<string>; whatsappSettings: WhatsappSettings }) {
    const conversations = new DrizzleConversationRepository();
    const bot = new QualifierBot(conversations, crmBotSettings, deps.sales, crmNotifier, deps.clock);
    this.gowa = new GowaClient(deps.whatsappSettings.gowa);
    const transport = whatsappTransport(this.gowa, deps.whatsappSettings.provider);
    this.chats = new MessagingService(conversations, new DrizzleMessageRepository(), drizzleBlocklist, transport, deps.sales, deps.links, crmNotifier, realtimeUpdates, deps.rules, bot, deps.clock, consoleLogger("chats"));
    this.site = new SiteChatService(this.chats, deps.sales, crmTasksAdapter, crmNotifier, realtimeUpdates, deps.clock, siteIds);
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
    return widgetSettings(this.deps.whatsapp);
  }

  /** Переписка посетителя для виджета. */
  siteMessages(token: string, after?: Date) {
    return this.queries.siteMessages(this.site.chatIdOf(token), after);
  }
}
