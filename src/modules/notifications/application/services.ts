import type { Clock, Mailer } from "@/shared/application";
import { canRemind, DAY, draftEmails, isSendingHour } from "../domain";
import type { ClientTimeline, ComposedEmail, EmailJournal, EmailTemplates, LifecycleSource, RecipientRepository, UnsubscribeLinks } from "./ports";

/**
 * Автоматические письма, которые возвращают клиента к книге и доводят до заказа и отзыва.
 * Каждое письмо уходит один раз (журнал), только днём по Алматы, не больше одного письма
 * клиенту за проход и только тем, кто не отписался. Письма о самом заказе — в контексте Ordering.
 */
export class LifecycleService {
  constructor(
    private readonly source: LifecycleSource,
    private readonly journal: EmailJournal,
    private readonly recipients: RecipientRepository,
    private readonly templates: EmailTemplates,
    private readonly mailer: Mailer,
    private readonly timeline: ClientTimeline,
    private readonly clock: Clock,
  ) {}

  private async deliver(clientId: string, email: ComposedEmail) {
    await this.mailer.send(email.to, email.subject, email.html);
    await this.timeline.emailSent(clientId, null, email.note);
  }

  /** Один проход планировщика. Возвращает количество отправленных писем. */
  async run(opts: { ignoreHours?: boolean } = {}) {
    const now = this.clock.now();
    if (!opts.ignoreHours && !isSendingHour(now)) return 0;
    const touched = new Set<string>();
    const before = (days: number) => new Date(now.getTime() - days * DAY);

    for (const c of await this.source.draftCandidates(before(1))) {
      if (touched.has(c.recipient.id)) continue;
      for (const email of draftEmails(c.book, now)) {
        if (!(await this.journal.claim(c.recipient.id, email.key))) continue;
        await this.deliver(c.recipient.id, this.templates.draft(email, c));
        if (email.kind === "nudge") await this.recipients.markReminded(c.recipient.id, now);
        touched.add(c.recipient.id);
        break;
      }
    }
    for (const o of await this.source.unpaidOrders(before(1))) {
      if (touched.has(o.recipient.id) || !(await this.journal.claim(o.recipient.id, `unpaid:${o.orderId}`))) continue;
      await this.deliver(o.recipient.id, this.templates.unpaid(o));
      touched.add(o.recipient.id);
    }
    // Печатную книгу просим оценить через 3 дня после доставки, электронную — через неделю после оплаты: её ещё нужно подарить.
    for (const o of await this.source.reviewDue(before(3), before(7))) {
      if (touched.has(o.recipient.id) || !(await this.journal.claim(o.recipient.id, `review:${o.orderId}`))) continue;
      await this.deliver(o.recipient.id, this.templates.review(o));
      touched.add(o.recipient.id);
    }
    return touched.size;
  }
}

export type ReminderResult = { ok: true } | { ok: false; reason: "clientNotFound" | "cooldown" | "noDraft" };

/** Ручное письмо «ваша книга ждёт продолжения» из CRM — по самой свежей незаказанной книге клиента. */
export class BookRemindersService {
  constructor(
    private readonly source: LifecycleSource,
    private readonly recipients: RecipientRepository,
    private readonly templates: EmailTemplates,
    private readonly mailer: Mailer,
    private readonly timeline: ClientTimeline,
    private readonly clock: Clock,
  ) {}

  async send(clientId: string, authorId: string | null): Promise<ReminderResult> {
    const now = this.clock.now();
    const recipient = await this.recipients.find(clientId);
    if (!recipient) return { ok: false, reason: "clientNotFound" };
    if (!canRemind(recipient.remindedAt, now)) return { ok: false, reason: "cooldown" };
    const book = await this.source.latestDraft(recipient.id);
    if (!book) return { ok: false, reason: "noDraft" };
    const email = this.templates.reminder(recipient, book);
    await this.mailer.send(email.to, email.subject, email.html);
    await this.recipients.markReminded(recipient.id, now);
    await this.timeline.emailSent(recipient.id, authorId, email.note);
    return { ok: true };
  }
}

/** Отписка от автописем по подписанной ссылке из письма. */
export class SubscriptionsService {
  constructor(
    private readonly recipients: RecipientRepository,
    private readonly links: UnsubscribeLinks,
  ) {}

  isValidLink(userId: string, token: string) {
    return /^[0-9a-f-]{36}$/i.test(userId) && this.links.verify(userId, token);
  }

  async unsubscribe(userId: string, token: string) {
    if (!this.isValidLink(userId, token)) return false;
    await this.recipients.optOut(userId);
    return true;
  }
}
