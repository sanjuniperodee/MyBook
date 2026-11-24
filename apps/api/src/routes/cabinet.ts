/**
 * Кабинет автора для приложения «MyBooks»: модели экранов из тех же функций, что рисуют страницы сайта, — подписи на
 * языке пользователя, адреса картинок обложек с версией.
 */
import { messagesFor } from "@/i18n/messages";
import { orderStatusLabel, orderStatusTone } from "@/modules/ordering/ui/status";
import { coverImagePath } from "@/server/cover-image";
import { shelfBooks } from "@/server/shelf";
import { site } from "@/config/site";
import { getTheme } from "@/lib/content/themes";
import { apiBook } from "@/server/api";
import { bookHub } from "@/server/book-hub";
import type { Handlers } from "../app";

export const cabinetHandlers: Pick<Handlers, "cabinetShelf" | "cabinetBook"> = {
  async cabinetShelf({ user }) {
    const locale = user!.locale === "kk" ? "kk" : "ru";
    const m = messagesFor(locale);
    const t = m.books.list;
    const books = await shelfBooks(user!.id, locale, m);
    return {
      books: books.map((b) => {
        const { book, answered, total, words, photos } = b.row;
        return {
          id: book.id,
          title: book.title,
          subtitle: book.subtitle,
          kind: b.kind,
          blank: b.blank,
          ordered: b.ordered,
          progress: b.progress,
          progressLabel: b.blank ? t.blankProgress(total, words) : t.ofQuestions(answered, total),
          counts: `${b.blank ? "" : `${m.common.count.words(words)} · `}${m.common.count.photos(photos)}`,
          updated: b.updated,
          deadline: b.deadline,
          order: b.order ? { id: b.order.id, number: b.order.number, label: m.orders.list.number(b.order.number), status: b.order.status, statusLabel: orderStatusLabel(b.order.status, locale, b.order.printed), tone: orderStatusTone[b.order.status] } : null,
          started: answered > 0 || words > 0,
          writeSectionId: b.writeSection,
          coverUrl: coverImagePath(book, 480),
          coverThumbUrl: coverImagePath(book, 240),
        };
      }),
    };
  },

  async cabinetBook({ req, user, input }) {
    const locale = user!.locale === "kk" ? "kk" : "ru";
    const m = messagesFor(locale);
    const { book } = await apiBook(req, input.bookId);
    const h = await bookHub(book, locale, m);
    const t = m.books.hub;
    const s = m.bookStudio.hub;
    // Раздел, который открывает ссылка вида /books/<id>/questions?s=<раздел>.
    const sectionOf = (href: string) => new URL(href, "http://x").searchParams.get("s");
    return {
      id: book.id,
      title: book.title,
      subtitle: book.subtitle,
      kind: getTheme(book.theme, locale).name,
      language: book.language,
      blank: h.blank,
      editable: h.editable,
      coverUrl: coverImagePath(book, 480),
      coverThumbUrl: coverImagePath(book, 240),
      card: h.card
        ? {
            eyebrow: h.card.eyebrow,
            title: h.card.title,
            text: h.card.text ?? null,
            serif: !!h.card.serif,
            primary: { href: h.card.primary.href, label: h.card.primary.label },
            primaryWrite: !!h.card.primary.icon,
            secondary: h.card.secondary ?? null,
            moreText: h.card.more?.text || null,
            more: h.card.more ? { href: h.card.more.href, label: h.card.more.label } : null,
          }
        : null,
      deadline: h.deadline,
      pathTitle: s.path.title,
      steps: h.rows.map((r) => ({ key: r.key, href: r.href, title: r.title, value: r.value, action: r.action, status: r.status, fraction: r.fraction, bar: r.bar ?? null, active: r.active })),
      needsTitle: h.hasErrors ? s.needs.errors : s.needs.warnings,
      needsFix: s.needs.fix,
      needs: h.needs.map((i) => ({ level: i.level, text: i.text, href: i.href ?? null })),
      chaptersTitle: t.chapters,
      chaptersAside: h.chapters.length ? t.chaptersStarted(h.chapters.filter((ch) => ch.answered > 0).length, h.chapters.length) : null,
      allChaptersLabel: t.allChapters(h.chapters.length),
      chapters: h.chapters.map((ch) => {
        const done = ch.total > 0 && ch.answered === ch.total;
        return { key: ch.key, title: ch.title, label: ch.total ? t.chapterSections(ch.answered, ch.total) : t.chapterEmpty, done, percent: ch.total ? Math.round((ch.answered / ch.total) * 100) : 0, sectionId: sectionOf(h.sectionHref(ch.firstOpenId ?? ch.firstId)) };
      }),
      letters: h.letters,
      help: { title: t.help, text: t.helpText, url: site.contacts.whatsapp },
      whereToStart: m.editor.whereToStart,
      tips: [...(h.blank ? m.editor.blank.tips : h.kind === "autobiography" ? m.editor.life.tips : m.editor.tips)],
      tipsNote: h.kind === "autobiography" ? m.editor.life.recordedNote : null,
    };
  },
};
