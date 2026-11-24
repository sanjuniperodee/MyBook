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
import { getInteriorDesign } from "@/lib/book/interiors/catalog";
import { isBookEditableBy } from "@/modules/authoring";
import { currentOption, placeNames, placeText } from "@/components/editor/photos/model";
import { filterCounts, isLossy, lossOf, placeTotals, visibleFilters } from "@/app/(app)/books/[id]/photos/photos-tab";
import { photosTabData } from "@/app/(app)/books/[id]/photos/photos-data";
import { helpAsk, helpThread } from "@/server/book-help";
import type { Handlers } from "../app";

export const cabinetHandlers: Pick<Handlers, "cabinetShelf" | "cabinetBook" | "cabinetPhotos" | "cabinetHelp" | "cabinetHelpAsk"> = {
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
      preview: h.preview,
    };
  },

  async cabinetPhotos({ req, user, input }) {
    const locale = user!.locale === "kk" ? "kk" : "ru";
    const m = messagesFor(locale);
    const { book, viewer } = await apiBook(req, input.bookId);
    const data = await photosTabData(book, book.status === "draft" && isBookEditableBy(book.userId, viewer), m);
    const tt = m.books.photosTab;
    const ps = m.editor.placeSheet;
    const places = new Map(data.places);
    const byId = new Map(data.photos.map((p) => [p.id, p]));
    const loss = (id: string) => lossOf(byId.get(id)!, byId.get(id), data.losses);
    const names = placeNames(data.chapters, data.answers, data.book.galleryTitle);
    const design = getInteriorDesign(data.book.interior);
    const openerDesign = !!design.opener.photo;
    const counts = filterCounts(data.photos, places, loss);
    const totals = placeTotals(data.photos, places);
    const photoUrl = (id: string, version: string | undefined, size: "thumb" | "view") => `/api/photos/${id}?size=${size}${version ? `&v=${version}` : ""}`;
    return {
      editable: data.book.editable,
      blank: data.book.blank,
      maxPhotos: data.maxPhotos ?? 100,
      title: m.books.photos.title,
      intro: tt.intro,
      addLabel: m.books.photos.add,
      summary: (["total", "placed", "auto", "off"] as const).map((k) => ({ key: k, label: tt.summary[k], hint: null, count: totals[k] })),
      filters: visibleFilters(counts, "all").map((f) => ({ key: f, label: tt.filters[f], hint: null, count: counts[f] })),
      ruleTitle: tt.rule.title,
      ruleName: tt.rule[data.book.photoPlacement].title,
      ruleChange: tt.rulesChange,
      noMatch: tt.noMatch,
      photos: data.photos.map((p, i) => {
        const place = places.get(p.id);
        const l = loss(p.id);
        return {
          id: p.id,
          n: i + 1,
          width: p.width,
          height: p.height,
          caption: p.caption,
          layout: p.layout,
          thumbUrl: photoUrl(p.id, p.version, "thumb"),
          url: photoUrl(p.id, p.version, "view"),
          place: {
            kind: place?.kind ?? "off",
            label: place ? placeText(place, names, m.editor, data.book.blank, { marked: p.opener, openerDesign }) : "",
            auto: !!place?.auto,
            onCover: place?.onCover ?? null,
            option: currentOption(place, p),
          },
          questionId: p.questionId ?? null,
          chapter: p.chapter ?? null,
          loss: isLossy(l) ? tt.lossChip(Math.round(l * 100)) : null,
        };
      }),
      chapters: data.chapters.map((c) => ({ key: c.key, title: c.title })),
      answers: data.answers.map((a) => ({ id: a.id, title: a.title, chapterKey: a.chapterKey })),
      sheet: {
        title: ps.title,
        options: [
          { key: "answer", ...(data.book.blank ? ps.answerBlank : ps.answer), count: null },
          ...(design.opener.photo ? [{ key: "opener", label: ps.opener.label, hint: ps.opener.hint(m.editor.openerShape[design.opener.photo]), count: null }] : []),
          { key: "after", ...ps.after, count: null },
          { key: "album", label: ps.album.label, hint: ps.album.hint(data.book.galleryTitle), count: null },
          { key: "auto", label: ps.auto.label, hint: ps.auto.hint[data.book.photoPlacement], count: null },
          { key: "off", ...ps.off, count: null },
        ],
        stepChapter: ps.step2Chapter,
        stepAnswer: data.book.blank ? ps.step2AnswerBlank : ps.step2Answer,
        here: ps.here,
        layoutTitle: ps.layoutTitle,
        layouts: (["full", "bleed", "half", "grid"] as const).map((k) => ({ key: k, label: ps.layouts[k], hint: null, count: null })),
        caption: ps.caption,
        done: m.editor.chapterPhoto.done,
        coverNote: ps.coverNote,
        backNote: ps.backNote,
        deleteLabel: tt.delete.confirm,
        deleteTitle: tt.delete.title,
        deleteText: tt.delete.text,
        deleteConfirm: tt.delete.confirm,
        deleteKeep: tt.delete.keep,
        cancel: tt.delete.cancel,
      },
    };
  },

  async cabinetHelp({ req, user, input }) {
    const locale = user!.locale === "kk" ? "kk" : "ru";
    const m = messagesFor(locale);
    const { book } = await apiBook(req, input.bookId);
    const t = m.help;
    const thread = await helpThread(book, user!.id);
    const section = (input.section ?? "overview") as keyof typeof t.faq;
    const faq = t.faq[section] ?? t.faq.overview;
    return {
      enabled: thread.enabled,
      whatsapp: thread.whatsapp,
      messages: thread.messages,
      hints: [...thread.hints.map((k) => t.hints[k as keyof typeof t.hints]).filter(Boolean), ...faq],
      labels: {
        button: t.button,
        title: t.title,
        subtitle: t.subtitle,
        hello: t.hello,
        faqTitle: t.faqTitle,
        placeholder: t.placeholder,
        typing: t.typing,
        bot: t.bot,
        manager: t.manager,
        notHelped: t.notHelped,
        callHuman: t.callHuman,
        handoff: t.handoff,
        whatsapp: t.whatsapp,
        disclaimer: t.disclaimer,
        off: t.off,
        error: t.error,
      },
    };
  },

  async cabinetHelpAsk({ req, user, input }) {
    const locale = user!.locale === "kk" ? "kk" : "ru";
    const { book } = await apiBook(req, input.bookId);
    const r = await helpAsk(book, user!, { text: input.body.text, place: null, human: input.body.human }, locale);
    return { outcome: r.outcome, suggestions: r.suggestions, messages: r.messages };
  },
};
