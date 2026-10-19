import type { Clock, Mailer } from "@/shared/application";
import { BookRemindersService, LifecycleService, SubscriptionsService, type ReviewLinks } from "./application";
import { crmTimeline, DrizzleEmailJournal, DrizzleLifecycleSource, DrizzleRecipients } from "./infrastructure/persistence";
import { emailTemplates } from "./infrastructure/templates";
import { hmacUnsubscribeLinks } from "./infrastructure/unsubscribe";

export { REMINDER_COOLDOWN_DAYS, canRemind } from "./domain";
export type { ReminderResult } from "./application";

/** Публичный фасад контекста «Уведомления»: автописьма, напоминания из CRM, отписка. */
export class NotificationsModule {
  readonly lifecycle: LifecycleService;
  readonly reminders: BookRemindersService;
  readonly subscriptions: SubscriptionsService;

  /** reviews — ссылка на форму отзыва и скидка за него (контекст Feedback). */
  constructor(deps: { mailer: Mailer; clock: Clock; reviews: ReviewLinks }) {
    const source = new DrizzleLifecycleSource();
    const recipients = new DrizzleRecipients();
    const templates = emailTemplates(deps.reviews);
    this.lifecycle = new LifecycleService(source, new DrizzleEmailJournal(), recipients, templates, deps.mailer, crmTimeline, deps.clock);
    this.reminders = new BookRemindersService(source, recipients, templates, deps.mailer, crmTimeline, deps.clock);
    this.subscriptions = new SubscriptionsService(recipients, hmacUnsubscribeLinks);
  }
}
