import "server-only";
import { formatPrice } from "@/config/site";
import { messagesFor } from "@/i18n/messages";
import { appLink, emailLayout, escapeHtml } from "@/shared/infrastructure/mail";
import type { DraftEmail } from "../domain";
import type { DraftCandidate, EmailTemplates, OrderReminder, Recipient } from "../application";
import { reviewUrl, THANK_YOU } from "@/modules/feedback";
import { unsubscribeUrl } from "./unsubscribe";

const msg = (r: Pick<Recipient, "locale">) => messagesFor(r.locale);
const hello = (r: Recipient) => msg(r).mail.hello(escapeHtml(r.name));

function footnote(r: Recipient) {
  const m = msg(r).mail;
  return `${m.helpFootnote} <a href="${unsubscribeUrl(r.id, r.locale)}" style="color:#7a7068">${m.unsubscribe}</a>`;
}

const bookLink = (c: DraftCandidate) => appLink(`/books/${c.book.bookId}/questions?q=${(c.book.firstEmpty ?? 0) + 1}`, c.recipient.locale);
const previewLink = (c: DraftCandidate) => appLink(`/books/${c.book.bookId}/preview`, c.recipient.locale);

/** Письма клиенту — на его языке; заметки в ленту CRM — по-русски. */
export const i18nEmailTemplates: EmailTemplates = {
  draft(email: DraftEmail, c: DraftCandidate) {
    const r = c.recipient;
    const m = msg(r);
    const title = escapeHtml(c.book.title);
    const base = { to: r.email, locale: r.locale, footnote: footnote(r) };
    switch (email.kind) {
      case "deadline": {
        const t = m.mail.lifecycle.deadline;
        const occasion = m.common.occasions[email.occasion as keyof typeof m.common.occasions];
        const by = email.orderBy;
        // «до 14 февраля» / «14 ақпанға дейін» — предлог и падеж берёт на себя словарь.
        const until = m.common.until(by);
        const ready = c.book.answered >= 10;
        const ru = messagesFor("ru").common;
        return {
          to: r.email,
          subject: t.subject(occasion.label, until),
          html: emailLayout({
            ...base,
            title: t.title(occasion.until, m.common.inDays(email.daysToTarget)),
            paragraphs: [hello(r), email.premiumOnly ? t.premium(title, until) : t.normal(title, until), ready ? t.ready(c.book.answered) : t.short],
            button: { label: ready ? t.preview : t.continue, url: ready ? previewLink(c) : bookLink(c) },
          }),
          note: `Автописьмо: напоминание о дедлайне (${ru.occasions[email.occasion as keyof typeof ru.occasions].label}, заказать ${ru.until(by)})`,
        };
      }
      case "almost": {
        const t = m.mail.lifecycle.almost;
        return {
          to: r.email,
          subject: t.subject(c.book.title),
          html: emailLayout({ ...base, title: t.title, paragraphs: [hello(r), t.text(title, c.book.answered), t.next], button: { label: t.button, url: previewLink(c) } }),
          note: `Автописьмо: книга почти готова (${c.book.answered} ответов)`,
        };
      }
      case "start": {
        const t = m.mail.lifecycle.start;
        return {
          to: r.email,
          subject: t.subject,
          html: emailLayout({ ...base, title: t.title, paragraphs: [hello(r), t.intro(title), ...t.tips], button: { label: t.button, url: bookLink(c) } }),
          note: "Автописьмо: советы, как начать книгу",
        };
      }
      case "nudge": {
        const t = m.mail.lifecycle.nudge;
        return {
          to: r.email,
          subject: t.subject(c.book.title),
          html: emailLayout({ ...base, title: t.title, paragraphs: [hello(r), t.text(c.book.answered), t.autosave], button: { label: t.button, url: bookLink(c) } }),
          note: `Автописьмо: напоминание дописать книгу (${c.book.answered} ответов)`,
        };
      }
    }
  },

  unpaid(o: OrderReminder) {
    const r = o.recipient;
    const t = msg(r).mail.lifecycle.unpaid;
    return {
      to: o.contactEmail,
      subject: t.subject(o.number),
      html: emailLayout({
        locale: r.locale,
        title: t.title,
        paragraphs: [hello(r), t.text(o.number, formatPrice(o.amount)), t.help],
        button: { label: t.button, url: appLink(`/orders/${o.orderId}`, r.locale) },
        footnote: footnote(r),
      }),
      note: `Автописьмо: напоминание об оплате заказа №${o.number}`,
    };
  },

  review(o: OrderReminder) {
    const r = o.recipient;
    const t = msg(r).mail.lifecycle.review;
    return {
      to: o.contactEmail,
      subject: t.subject,
      html: emailLayout({
        locale: r.locale,
        title: t.title,
        paragraphs: [hello(r), t.text, t.thanks(THANK_YOU.percent), t.gift(appLink("/gift", r.locale))],
        button: { label: t.button, url: reviewUrl(o.orderId, r.locale) },
        footnote: footnote(r),
      }),
      note: `Автописьмо: просьба об отзыве по заказу №${o.number}`,
    };
  },

  reminder(r, book) {
    const m = msg(r).mail;
    const title = escapeHtml(book.title);
    return {
      to: r.email,
      subject: m.reminder.subject(book.title),
      html: emailLayout({
        locale: r.locale,
        title: m.reminder.title,
        paragraphs: [hello(r), book.answered ? m.reminder.progress(title, book.answered, book.total) : m.reminder.empty(title), m.reminder.autosave],
        button: { label: m.reminder.button, url: appLink(`/books/${book.bookId}/questions?q=${(book.firstEmpty ?? 0) + 1}`, r.locale) },
        footnote: m.reminder.footnote,
      }),
      note: `Отправлено напоминание дописать книгу «${book.title}» (${book.answered}/${book.total})`,
    };
  },
};
