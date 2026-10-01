import type { Clock } from "@/shared/application";
import { consoleLogger } from "@/shared/application";
import { MessagingService, QualifierBot, SiteChatService, type IncomingRules, type LinkAttribution, type SalesGateway } from "./application";
import { channelTransport, crmBotSettings, crmNotifier, crmTasksAdapter, realtimeUpdates, siteIds, widgetSettings } from "./infrastructure/adapters";
import { DrizzleConversationRepository, DrizzleMessageRepository, DrizzleMessagingQueries, drizzleBlocklist } from "./infrastructure/persistence";

export { channelLabel, channelLabels, type Conversation, type InboundMessage } from "./domain";
export type { IngestExtra, SalesGateway as MessagingSalesGateway, IncomingRules } from "./application";

/** Cookie посетителя для чата на сайте. */
export const VISITOR_COOKIE = "mb_chat";

/** Публичный фасад контекста «Переписка»: единый инбокс, бот-квалификатор, виджет на сайте. */
export class MessagingModule {
  readonly chats: MessagingService;
  readonly site: SiteChatService;
  readonly queries = new DrizzleMessagingQueries();

  constructor(private readonly deps: { clock: Clock; sales: SalesGateway; rules: IncomingRules; links: LinkAttribution; whatsapp: () => Promise<string> }) {
    const conversations = new DrizzleConversationRepository();
    const bot = new QualifierBot(conversations, crmBotSettings, deps.sales, crmNotifier, deps.clock);
    this.chats = new MessagingService(conversations, new DrizzleMessageRepository(), drizzleBlocklist, channelTransport, deps.sales, deps.links, crmNotifier, realtimeUpdates, deps.rules, bot, deps.clock, consoleLogger("chats"));
    this.site = new SiteChatService(this.chats, deps.sales, crmTasksAdapter, crmNotifier, realtimeUpdates, deps.clock, siteIds);
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
