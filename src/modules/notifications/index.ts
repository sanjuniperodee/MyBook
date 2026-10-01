import type { Clock, Mailer } from "@/shared/application";
import { BookRemindersService, LifecycleService, SubscriptionsService } from "./application";
import { crmTimeline, DrizzleEmailJournal, DrizzleLifecycleSource, DrizzleRecipients } from "./infrastructure/persistence";
import { i18nEmailTemplates } from "./infrastructure/templates";
import { hmacUnsubscribeLinks } from "./infrastructure/unsubscribe";

export { ALMOST_READY_ANSWERS, REMINDER_COOLDOWN_DAYS, canRemind, isSendingHour } from "./domain";
export type { ReminderResult } from "./application";

/** Публичный фасад контекста «Уведомления»: автописьма, напоминания из CRM, отписка. */
export class NotificationsModule {
  readonly lifecycle: LifecycleService;
  readonly reminders: BookRemindersService;
  readonly subscriptions: SubscriptionsService;

  constructor(deps: { mailer: Mailer; clock: Clock }) {
    const source = new DrizzleLifecycleSource();
    const recipients = new DrizzleRecipients();
    this.lifecycle = new LifecycleService(source, new DrizzleEmailJournal(), recipients, i18nEmailTemplates, deps.mailer, crmTimeline, deps.clock);
    this.reminders = new BookRemindersService(source, recipients, i18nEmailTemplates, deps.mailer, crmTimeline, deps.clock);
    this.subscriptions = new SubscriptionsService(recipients, hmacUnsubscribeLinks);
  }
}
