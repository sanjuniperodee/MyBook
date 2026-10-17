import "server-only";
import { formatPrice } from "@/config/site";
import { messagesFor } from "@/i18n/messages";
import { bookKind, progressOf } from "@/lib/content/kinds";
import { appLink, emailLayout, escapeHtml } from "@/shared/infrastructure/mail";
import type { DraftEmail } from "../domain";
import type { DraftCandidate, EmailTemplates, OrderReminder, Recipient, ReviewLinks } from "../application";
import { unsubscribeUrl } from "./unsubscribe";

const msg = (r: Pick<Recipient, "locale">) => messagesFor(r.locale);
const hello = (r: Recipient) => msg(r).mail.hello(escapeHtml(r.name));

function footnote(r: Recipient) {
  const m = msg(r).mail;
  return `${m.helpFootnote} <a href="${unsubscribeUrl(r.id, r.locale)}" style="color:#7a7068">${m.unsubscribe}</a>`;
}

/** Ссылка в редактор: на первый раздел без текста (?s=<id>), а у пустой книги без разделов — на корень редактора. */
export const editorPath = (bookId: string, firstEmpty: string | null) => `/books/${bookId}/questions${firstEmpty ? `?s=${firstEmpty}` : ""}`;
const bookLink = (c: DraftCandidate) => appLink(editorPath(c.book.bookId, c.book.firstEmpty), c.recipient.locale);
const previewLink = (c: DraftCandidate) => appLink(`/books/${c.book.bookId}/preview`, c.recipient.locale);

/** Письма клиенту — на его языке; заметки в ленту CRM — по-русски. */
const baseTemplates: Omit<EmailTemplates, "review"> = {
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
        // «Уже есть что напечатать» — тот же порог, что шаг «Текст» на хабе (progressOf).
        const kind = bookKind(c.book.theme);
        const ready = progressOf(kind, { answered: c.book.answered, total: 0, words: c.book.words }).textStepDone;
        const ru = messagesFor("ru").common;
        return {
          to: r.email,
          subject: t.subject(occasion.label, until),
          html: emailLayout({
            ...base,
            title: t.title(occasion.until, m.common.inDays(email.daysToTarget)),
            paragraphs: [hello(r), email.premiumOnly ? t.premium(title, until) : t.normal(title, until), ready ? (kind === "blank" ? t.readyWords(c.book.words) : t.ready(c.book.answered)) : kind === "blank" ? t.shortWords : t.short],
            button: { label: ready ? t.preview : t.continue, url: ready ? previewLink(c) : bookLink(c) },
          }),
          note: `Автописьмо: напоминание о дедлайне (${ru.occasions[email.occasion as keyof typeof ru.occasions].label}, заказать ${ru.until(by)})`,
        };
      }
      case "almost": {
        const t = m.mail.lifecycle.almost;
        const blank = bookKind(c.book.theme) === "blank";
        return {
          to: r.email,
          subject: t.subject(c.book.title),
          html: emailLayout({ ...base, title: t.title, paragraphs: [hello(r), blank ? t.textWords(title, c.book.words) : t.text(title, c.book.answered), t.next], button: { label: t.button, url: previewLink(c) } }),
          note: `Автописьмо: книга почти готова (${blank ? `${c.book.words} слов` : `${c.book.answered} ответов`})`,
        };
      }
      case "start": {
        // Советы по виду книги: подарок, автобиография (вспоминать и рассказывать) и своя книга (разделы и заголовки).
        const kind = bookKind(c.book.theme);
        const t = kind === "gift" ? m.mail.lifecycle.start : m.mail.lifecycle.start[kind];
        return {
          to: r.email,
          subject: m.mail.lifecycle.start.subject,
          html: emailLayout({ ...base, title: m.mail.lifecycle.start.title, paragraphs: [hello(r), t.intro(title), ...t.tips], button: { label: t.button, url: bookLink(c) } }),
          note: "Автописьмо: советы, как начать книгу",
        };
      }
      case "nudge": {
        const t = m.mail.lifecycle.nudge;
        const blank = bookKind(c.book.theme) === "blank";
        return {
          to: r.email,
          subject: t.subject(c.book.title),
          html: emailLayout({ ...base, title: t.title, paragraphs: [hello(r), blank ? t.textWords(c.book.words) : t.text(c.book.answered), t.autosave], button: { label: t.button, url: bookLink(c) } }),
          note: `Автописьмо: напоминание дописать книгу (${blank ? `${c.book.words} слов` : `${c.book.answered} ответов`})`,
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

  reminder(r, book) {
    const m = msg(r).mail;
    const title = escapeHtml(book.title);
    const blank = bookKind(book.theme) === "blank";
    return {
      to: r.email,
      subject: m.reminder.subject(book.title),
      html: emailLayout({
        locale: r.locale,
        title: m.reminder.title,
        paragraphs: [hello(r), blank ? (book.words ? m.reminder.progressWords(title, book.words) : m.reminder.empty(title)) : book.answered ? m.reminder.progress(title, book.answered, book.total) : m.reminder.empty(title), m.reminder.autosave],
        button: { label: m.reminder.button, url: appLink(editorPath(book.bookId, book.firstEmpty), r.locale) },
        footnote: m.reminder.footnote,
      }),
      note: `Отправлено напоминание дописать книгу «${book.title}» (${blank ? `${book.words} слов` : `${book.answered}/${book.total}`})`,
    };
  },
};

/** Просьба об отзыве: ссылку на форму и скидку за отзыв даёт Feedback. */
const reviewMail = (reviews: ReviewLinks) => (o: OrderReminder) => {
  const r = o.recipient;
  const t = msg(r).mail.lifecycle.review;
  // Просьба об отзыве по виду книги: подарок — «как прошло вручение», автобиография и своя книга — без «подарка».
  const kind = bookKind(o.theme);
  return {
    to: o.contactEmail,
    subject: t.subject,
    html: emailLayout({
      locale: r.locale,
      title: t.title,
      paragraphs: [hello(r), kind === "autobiography" ? t.textAutobiography : kind === "blank" ? t.textBlank : t.text, t.thanks(reviews.thankYouPercent), (kind === "autobiography" ? t.giftAutobiography : t.gift)(appLink("/gift", r.locale))],
      button: { label: t.button, url: reviews.url(o.orderId, r.locale) },
      footnote: footnote(r),
    }),
    note: `Автописьмо: просьба об отзыве по заказу №${o.number}`,
  };
};

export const emailTemplates = (reviews: ReviewLinks): EmailTemplates => ({ ...baseTemplates, review: reviewMail(reviews) });
