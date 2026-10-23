import type { Clock, Mailer } from "@/shared/application";
import { isPhoneStubEmail } from "@/shared/domain/phone";
import { canRemind, DAY, draftEmails, isSendingHour } from "../domain";
import type { ClientTimeline, ComposedEmail, EmailJournal, EmailTemplates, LifecycleSource, RecipientRepository, UnsubscribeLinks } from "./ports";

/**
 * Автоматические письма, которые возвращают клиента к книге и доводят до заказа и отзыва.
 * Каждое письмо уходит один раз (журнал), только днём по времени магазина, не больше одного письма
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

  /**
   * Отправить письмо один раз по ключу (automation-d9): «отправлено» в журнале и ленте — только если SMTP принял письмо.
   * dup — это письмо уже было, можно пробовать следующее; skip — сейчас не отправить (заглушка вместо почты, SMTP не
   * настроен или ошибка): отметку снимаем, следующий проход попробует снова.
   */
  private async deliver(clientId: string, key: string, email: ComposedEmail, mailOn: boolean): Promise<"sent" | "dup" | "skip"> {
    if (!mailOn || isPhoneStubEmail(email.to)) return "skip";
    if (!(await this.journal.claim(clientId, key))) return "dup";
    const res = await this.mailer.send(email.to, email.subject, email.html);
    if (res !== "sent") {
      await this.journal.release(clientId, key);
      return "skip";
    }
    await this.timeline.emailSent(clientId, null, email.note);
    return "sent";
  }

  /** Один проход планировщика. Возвращает количество отправленных писем. */
  async run(opts: { ignoreHours?: boolean } = {}) {
    const now = this.clock.now();
    if (!opts.ignoreHours && !isSendingHour(now)) return 0;
    const mailOn = await this.mailer.configured();
    const touched = new Set<string>();
    const before = (days: number) => new Date(now.getTime() - days * DAY);

    for (const c of await this.source.draftCandidates(before(1))) {
      if (touched.has(c.recipient.id)) continue;
      for (const email of draftEmails(c.book, now)) {
        const res = await this.deliver(c.recipient.id, email.key, this.templates.draft(email, c), mailOn);
        if (res === "dup") continue;
        if (res === "sent") {
          if (email.kind === "nudge") await this.recipients.markReminded(c.recipient.id, now);
          touched.add(c.recipient.id);
        }
        break;
      }
    }
    for (const o of await this.source.unpaidOrders(before(1))) {
      if (touched.has(o.recipient.id)) continue;
      if ((await this.deliver(o.recipient.id, `unpaid:${o.orderId}`, this.templates.unpaid(o), mailOn)) === "sent") touched.add(o.recipient.id);
    }
    // Печатную книгу просим оценить через 3 дня после доставки, электронную — через неделю после оплаты: её ещё нужно подарить.
    for (const o of await this.source.reviewDue(before(3), before(7))) {
      if (touched.has(o.recipient.id)) continue;
      if ((await this.deliver(o.recipient.id, `review:${o.orderId}`, this.templates.review(o), mailOn)) === "sent") touched.add(o.recipient.id);
    }
    return touched.size;
  }
}

/** Почему ручное напоминание не ушло: noEmail — у клиента заглушка вместо почты, optedOut — отписался, mailOff — SMTP не настроен, mailFailed — ошибка SMTP. */
export type ReminderResult = { ok: true } | { ok: false; reason: "clientNotFound" | "cooldown" | "noDraft" | "noEmail" | "optedOut" | "mailOff" | "mailFailed" };

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
    if (isPhoneStubEmail(recipient.email)) return { ok: false, reason: "noEmail" };
    if (recipient.optOut) return { ok: false, reason: "optedOut" };
    if (!canRemind(recipient.remindedAt, now)) return { ok: false, reason: "cooldown" };
    const book = await this.source.latestDraft(recipient.id);
    if (!book) return { ok: false, reason: "noDraft" };
    const email = this.templates.reminder(recipient, book);
    const res = await this.mailer.send(email.to, email.subject, email.html);
    if (res === "unconfigured") return { ok: false, reason: "mailOff" };
    if (res !== "sent") return { ok: false, reason: res === "skipped_stub" ? "noEmail" : "mailFailed" };
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
