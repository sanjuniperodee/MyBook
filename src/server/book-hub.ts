import "server-only";
import { container } from "@/server/container";
import { chapterTitle, getTheme } from "@/lib/content/themes";
import { applyGender } from "@/lib/content/gender";
import { BLANK_READY_WORDS, bookKind } from "@/lib/content/kinds";
import { messagesFor } from "@/i18n/messages";
import type { Messages } from "@/i18n/messages";
import type { Locale } from "@/i18n/config";
import { questionTexts } from "@/lib/book/layout";
import { sectionLabel } from "@/lib/book/editor-model";
import { hubChapters, sectionHref as sectionLink } from "@/lib/book/hub-model";
import { bookNav, stepHref, type StepKey, type StepStatus } from "@/lib/book/book-nav";
import { coverName, interiorName } from "@/i18n/labels";
import { isPrintedPlan, orderStatusLabel } from "@/modules/ordering/ui/status";
import { isPaid } from "@/modules/ordering/domain";
import { checkReadiness } from "@/modules/authoring/domain/readiness";
import { deadlineFor, getOccasion, parseDay } from "@/lib/occasions";
import { nowMs } from "@/lib/dates";
import type { getAccessibleBook } from "@/server/books";

type Book = Awaited<ReturnType<typeof getAccessibleBook>>;

/** Сколько ответов считаем «полноценной книгой» для расчёта темпа (как DeadlineBanner). */
const GOOD_BOOK_ANSWERS = 30;

export interface HubStepRow {
  key: string;
  href: string;
  title: string;
  value: string;
  action: string;
  bar?: number;
  status: StepStatus;
  fraction: number;
  active: boolean;
}

/** Карточка «Следующий шаг»: пока пишем — вопрос; потом обложка; потом заказ; после заказа — состояние заказа. */
export interface HubCard {
  eyebrow: string;
  title: string;
  text?: string;
  serif?: boolean;
  lang?: string;
  primary: { href: string; label: string; icon?: boolean };
  secondary?: { href: string; label: string };
  more?: { href: string; label: string; text: string };
}

/** Отсчёт до праздника (как DeadlineBanner): дни, заголовок, строка срока; null у книги без даты или после праздника. */
export interface HubDeadline {
  days: number;
  daysShort: string;
  tone: "calm" | "warm" | "hot";
  headline: string;
  line: string;
  /** Значок строки: clock — обычный срок, zap — срочная печать, null — электронная книга. */
  icon: "clock" | "zap" | null;
  changeLabel: string;
}

/**
 * Штаб книги — одна модель для страницы /books/[id] и приложения (API v1 cabinetBook): шаги пути, карточка следующего
 * шага, замечания к готовности, главы, письма, срок к празднику. Подписи — на языке интерфейса, главы — на языке книги.
 */
export async function bookHub(book: Book, locale: Locale, m: Messages) {
  const [stats, questions, ownChapters, photos, order, letterRows, built] = await Promise.all([
    container().authoring.queries.stats(book),
    container().authoring.queries.questions(book.id),
    container().authoring.queries.chapters(book.id),
    container().authoring.queries.photos(book.id),
    container().ordering.queries.lastOrderOfBook(book.id),
    container().authoring.queries.letters(book.id),
    // Готовый макет текущей книги — точное число страниц (как в предпросмотре); нет — оценка со знаком «≈».
    container().previews.current(book.id).catch(() => null),
  ]);
  const printedPages = built?.pageCount ?? stats.printedPages;
  const contentPages = built?.contentPages ?? stats.estimatedPages;
  // Договорённость с менеджером и внесённая предоплата — клиенту видно, что уже оплачено и что остаётся.
  const agreement = book.status === "draft" ? await container().ordering.orders.agreementFor(book.userId) : null;
  const letterStats = {
    approved: letterRows.filter((l) => l.status === "approved").length,
    pending: letterRows.filter((l) => l.status === "pending").length,
  };
  const t = m.books.hub;
  const s = m.bookStudio.hub;
  const nv = m.bookStudio.nav;
  const c = m.common;
  // Главы и вопросы — на языке книги (это её содержимое), подписи вокруг — на языке интерфейса.
  const theme = getTheme(book.theme, book.language);
  const g = (x: string) => applyGender(x, book.authorGender, book.recipientGender);
  const kind = bookKind(book.theme);
  // Главы своей книги — названия автора (без подстановки рода), остальных — из темы.
  const ownTitles = new Map(ownChapters.map((ch) => [ch.key, ch.title.trim()]));
  const titleOf = (key: string) => (kind === "blank" ? ownTitles.get(key) || messagesFor(book.language).book.untitledChapter : g(chapterTitle(theme, key, book.language)));
  const editable = book.status === "draft";
  const blank = kind === "blank";
  const base = `/books/${book.id}`;
  // Полоса прогресса: у книг с банком — доля вопросов с ответом, у своей книги — путь к «почти готовой» книге по словам.
  const percent = blank ? Math.min(100, Math.round((stats.words / BLANK_READY_WORDS) * 100)) : stats.total ? Math.round((stats.answered / stats.total) * 100) : 0;
  const chapters = hubChapters(book.theme, ownChapters, questions, titleOf);
  const sectionHref = (sid: string | null) => sectionLink(book.id, sid);
  const next = questions.find((q) => !q.answer.trim()) ?? null;
  const nextChapter = next ? chapters.find((ch) => ch.key === next.chapter) : null;
  // Свой вопрос и раздел своей книги — как их написал автор; пустая подсказка раздела — его заголовок.
  const nextTexts = next ? questionTexts(next, book) : null;
  const nextLabel = next && nextTexts ? sectionLabel({ prompt: nextTexts.prompt, defaultTitle: nextTexts.title, displayText: next.displayText, hideHeading: next.hideHeading }, kind, m.books.untitledSection) : "";
  // Следующий вопрос или создание первой главы: что делать, пока текст не написан.
  const cta =
    blank && chapters.length === 0
      ? { href: `${base}/questions`, eyebrow: t.createFirstChapter, label: t.createFirstChapterText }
      : next
        ? { href: sectionHref(next.id), eyebrow: `${blank || stats.answered ? (blank ? t.continueWriting : t.nextQuestion) : t.firstQuestion}${nextChapter ? ` · ${nextChapter.title}` : ""}`, label: nextLabel }
        : blank
          ? { href: sectionHref(questions[0]?.id ?? null), eyebrow: t.continueWriting, label: t.openEditor }
          : null;

  // Замечания к готовности (как перед оплатой, но без сборки макета): блокирующие и подсказки.
  const issues = editable ? checkReadiness(book, { ...stats, estimatedPages: contentPages }, photos, locale) : [];
  const coverIssue = issues.find((i) => i.level === "error" && i.href?.endsWith("/cover")) ?? null;
  const paid = !!order && isPaid(order.status);
  // Книга открыта для правок по живому заказу (менеджер открыл доступ): заказ уже есть, второй не оформляется.
  const reopened = editable && !!order && order.status !== "cancelled";
  const nav = bookNav({
    kind,
    answered: stats.answered,
    total: stats.total,
    words: stats.words,
    photos: photos.length,
    letters: letterStats,
    coverReady: !coverIssue,
    ordered: !editable || reopened,
    paid,
    order: order ? { id: order.id, number: order.number, status: order.status, plan: order.plan } : null,
  });
  const orderLabel = order ? orderStatusLabel(order.status, locale, isPrintedPlan(order.plan)) : "";

  // До заказа не хватает: пока текст не написан, замечания о тексте повторяют карточку «Следующий шаг».
  // Пока текста нет, остальные подсказки (объём, фото) рано: остаются только блокирующие замечания не о тексте.
  const needs = nav.textDone ? issues : issues.filter((i) => i.level === "error" && !i.href?.endsWith("/questions"));
  const hasErrors = needs.some((i) => i.level === "error");

  // Строки пути: что сделано, что сейчас и куда вести.
  const a = s.path.actions;
  // Путь книги — те же пять шагов, что в шапке: обложка и страницы — «Оформить», макет и заказ — «Заказать».
  const stepOf = (key: StepKey) => {
    const st = nav.steps.find((x) => x.key === key)!;
    return { status: st.status, fraction: st.fraction };
  };
  const rows: HubStepRow[] = [
    {
      key: "write",
      href: stepHref(book.id, "questions", nav),
      title: blank ? nv.steps.text : nv.groups.write,
      value: blank ? t.blankStats(stats.total, stats.words) : `${stats.total ? `${c.count.answers(stats.answered)} ${s.facts.of(stats.total)}` : c.count.answers(stats.answered)}, ${c.count.words(stats.words)}`,
      action: !editable ? a.open : nav.textDone ? a.open : stats.answered || stats.words ? a.continue : a.start,
      bar: percent,
      ...stepOf("questions"),
      active: nav.current === "questions",
    },
    { key: "photos", href: stepHref(book.id, "photos", nav), title: nv.groups.photos, value: photos.length ? c.count.photos(photos.length) : s.path.photosHint, action: photos.length ? a.manage : a.add, ...stepOf("photos"), active: false },
    {
      key: "design",
      href: stepHref(book.id, "cover", nav),
      title: nv.groups.design,
      value: coverIssue ? coverIssue.text : `${coverName(book.coverTemplate, locale)}, ${interiorName(book.interior, locale)}`,
      action: coverIssue ? a.fix : a.change,
      ...stepOf("cover"),
      active: nav.current === "cover",
    },
    {
      key: "order",
      href: nav.ordered ? stepHref(book.id, "order", nav) : stepHref(book.id, "preview", nav),
      title: nv.groups.order,
      value: order && (!editable || order.status !== "cancelled") ? orderLabel : s.path.previewValue,
      action: !editable || reopened ? (paid ? a.openOrder : a.pay) : a.order,
      ...stepOf("order"),
      active: nav.current === "order",
    },
  ];

  const unanswered = Math.max(0, stats.total - stats.answered);
  let card: HubCard | null = null;
  if (!editable || reopened) {
    // Открытая для правок книга: не «редактирование закрыто», а «правки попадут в этот заказ».
    const locked = reopened ? s.next.reopenedText : t.locked;
    card = order
      ? {
          eyebrow: s.next.orderedEyebrow(order.number),
          title: order.status === "pending_payment" ? s.next.orderedPayTitle : orderLabel,
          text: order.status === "pending_payment" ? `${s.next.orderedPayText} ${locked}` : locked,
          primary: { href: `/orders/${order.id}`, label: s.next.openOrder },
        }
      : { eyebrow: s.next.label, title: s.next.orderedNoOrder, text: t.locked, primary: { href: `${base}/preview`, label: s.next.openPreview } };
  } else if (!nav.textDone && cta) {
    card = { eyebrow: cta.eyebrow, title: cta.label, serif: true, lang: book.language, primary: { href: cta.href, label: next && !blank ? t.answerCta : t.writeCta, icon: true } };
  } else if (coverIssue) {
    card = { eyebrow: s.next.label, title: s.next.coverTitle, text: coverIssue.text, primary: { href: `${base}/cover`, label: s.next.openCover } };
  } else if (nav.ready || nav.textDone) {
    card = {
      eyebrow: s.next.readyEyebrow,
      title: s.next.readyTitle,
      text: s.next.readyText,
      primary: { href: `${base}/checkout`, label: s.next.order },
      secondary: { href: `${base}/preview`, label: s.next.openPreview },
      more: cta && (blank || unanswered) ? { href: cta.href, label: s.next.keepWriting, text: blank ? "" : s.next.moreToWrite(unanswered) } : undefined,
    };
  }

  const letters = {
    href: `${base}/letters`,
    title: s.lower.lettersTitle,
    text: letterStats.approved || letterStats.pending ? s.lower.lettersState(letterStats.approved, letterStats.pending) : book.inviteToken ? s.lower.lettersInvited : s.lower.lettersEmpty,
    action: letterStats.pending ? s.lower.lettersReview(letterStats.pending) : book.inviteToken ? s.lower.lettersOpen : s.lower.lettersCreate,
  };

  return {
    stats,
    questions,
    photos,
    order,
    printedPages,
    agreement,
    letterStats,
    letters,
    kind,
    blank,
    editable,
    percent,
    chapters,
    sectionHref,
    nav,
    rows,
    card,
    needs,
    hasErrors,
    deadline: editable ? hubDeadline(book.occasion, book.occasionDate, stats.answered, m) : null,
  };
}

/** Срок к празднику для обзора книги — те же строки, что DeadlineBanner. */
export function hubDeadline(occasion: string | null, occasionDate: string | null, answered: number, m: Messages): HubDeadline | null {
  const o = getOccasion(occasion);
  if (!o || !occasionDate) return null;
  const c = m.common;
  const dl = deadlineFor(occasionDate, new Date(nowMs()));
  if (dl.state === "past") return null;
  const left = Math.max(0, GOOD_BOOK_ANSWERS - answered);
  const perDay = left && dl.daysToOrder > 0 ? Math.ceil(left / dl.daysToOrder) : 0;
  const tone = dl.state === "relaxed" ? "calm" : dl.state === "soon" ? "warm" : "hot";
  const line = dl.state === "digital" ? c.deadline.digital : dl.state === "premium" ? c.deadline.premium(dl.orderByPremium) : `${c.deadline.orderBy(dl.orderBy, dl.daysToOrder)}${perDay ? c.deadline.pace(perDay) : ""}`;
  return {
    days: dl.daysToTarget,
    daysShort: c.daysShort,
    tone,
    headline: c.deadline.headline(c.occasions[o.id].label, parseDay(occasionDate), dl.daysToTarget),
    line,
    icon: dl.state === "digital" ? null : dl.state === "premium" ? "zap" : "clock",
    changeLabel: c.deadline.changeDate,
  };
}
