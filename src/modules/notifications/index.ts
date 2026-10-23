import type { Clock, Mailer, SettingsReader } from "@/shared/application";
import { BookRemindersService, LifecycleService, SubscriptionsService, type ClientChat, type ReviewLinks } from "./application";
import { parseChatKinds } from "./domain";
import { crmTimeline, DrizzleEmailJournal, DrizzleLifecycleSource, DrizzleRecipients } from "./infrastructure/persistence";
import { emailTemplates } from "./infrastructure/templates";
import { hmacUnsubscribeLinks } from "./infrastructure/unsubscribe";

export { LIFECYCLE_CHAT_KINDS, REMINDER_COOLDOWN_DAYS, canRemind, parseChatKinds, type LifecycleChatKind } from "./domain";
export type { ReminderResult } from "./application";

/** Публичный фасад контекста «Уведомления»: автописьма, напоминания из CRM, отписка. */
export class NotificationsModule {
  readonly lifecycle: LifecycleService;
  readonly reminders: BookRemindersService;
  readonly subscriptions: SubscriptionsService;

  /**
   * reviews — ссылка на форму отзыва и скидка за него (контекст Feedback); chat — переписка клиента в WhatsApp (Messaging)
   * для автописем клиентам без почты, включённых в настройке notify.whatsapp.
   */
  constructor(deps: { mailer: Mailer; clock: Clock; reviews: ReviewLinks; chat?: Pick<ClientChat, "send">; settings?: SettingsReader<"notify.whatsapp"> }) {
    const source = new DrizzleLifecycleSource();
    const recipients = new DrizzleRecipients();
    const templates = emailTemplates(deps.reviews);
    const { chat, settings } = deps;
    const whatsapp: ClientChat | undefined = chat && settings ? { send: (clientId, text, rule) => chat.send(clientId, text, rule), kinds: async () => parseChatKinds(await settings.get("notify.whatsapp")) } : undefined;
    this.lifecycle = new LifecycleService(source, new DrizzleEmailJournal(), recipients, templates, deps.mailer, crmTimeline, deps.clock, whatsapp);
    this.reminders = new BookRemindersService(source, recipients, templates, deps.mailer, crmTimeline, deps.clock);
    this.subscriptions = new SubscriptionsService(recipients, hmacUnsubscribeLinks);
  }
}
