import type { z } from "zod";
import type {
  WebBookCoverPage,
  WebBookHubResponse,
  WebBookLettersPage,
  WebBookNav,
  WebBookNavResponse,
  WebBookPagesPage,
  WebBookPhotosPage,
  WebBookPreviewPage,
  WebBookQuestionsPage,
  WebDealAgreement,
} from "@mybook/contracts";
import { site } from "@/config/site";
import type { Locale } from "@/i18n/config";
import { coverName, interiorName } from "@/i18n/labels";
import { messagesFor, type Messages } from "@/i18n/messages";
import type { BookBuild } from "@/lib/book/book-build";
import { buildBookContent } from "@/lib/book/book-content";
import { bookNav, stepHref, type BookNav, type StepKey } from "@/lib/book/book-nav";
import { backContent, backPhotoIds } from "@/lib/book/cover-back";
import { parseCoverDesign } from "@/lib/book/cover-design";
import { coverNames, printedCoverTitle } from "@/lib/book/cover-names";
import { withCoverPhotos } from "@/lib/book/cover-photos";
import { coverPhotoIds } from "@/lib/book/covers";
import { editorBook, editorModel } from "@/lib/book/editor-data";
import { sectionLabel } from "@/lib/book/editor-model";
import { getFormat, print } from "@/lib/book/formats";
import { hubChapters, sectionHref as sectionLink } from "@/lib/book/hub-model";
import { getInteriorDesign } from "@/lib/book/interiors";
import { isChapterPhotoKey, questionTexts, toPhotoItem } from "@/lib/book/layout";
import { SUGGEST_TOP, suggestOpener } from "@/lib/book/opener-suggest";
import { photoLosses } from "@/lib/book/photo-loss";
import { openerFrame } from "@/lib/book/photo-pages";
import { photoPlaceOf } from "@/lib/book/photo-place";
import { backPhotoRefs, coverPhotoRefs } from "@/lib/book/photo-refs";
import { bookSpreadSample } from "@/lib/book/spread-sample";
import { tocKey } from "@/lib/book/toc";
import { asRecord, asRecordOrNull, buildHubDeadline, entriesToPlacePairs, fromWebBookRow, normalizeSpreadSample, placesToEntries, toWebBookRow, type WebBookRowDto } from "@/lib/book/web-book-row";
import { applyGender } from "@/lib/content/gender";
import { BLANK_READY_WORDS, bookKind } from "@/lib/content/kinds";
import { chapterTitle, getTheme } from "@/lib/content/themes";
import { photoVersion } from "@/lib/photo-edit/doc";
import { isBookEditableBy, type BookViewer } from "../domain/Book";
import { checkReadiness } from "../domain/readiness";
import type { BookStats } from "../domain/stats";
import type { BookBundle, BookRow, ChapterRow, LetterRow, PhotoRow, QuestionRow } from "../infrastructure/queries";

export { buildHubDeadline, entriesToPlacePairs, fromWebBookRow, toWebBookRow, type WebBookRowDto };

export type WebBookNavDto = z.output<typeof WebBookNav>;
export type WebBookNavResponseDto = z.output<typeof WebBookNavResponse>;
export type WebBookHubDto = z.output<typeof WebBookHubResponse>;
export type WebBookQuestionsPageDto = z.output<typeof WebBookQuestionsPage>;
export type WebBookPhotosPageDto = z.output<typeof WebBookPhotosPage>;
export type WebBookLettersPageDto = z.output<typeof WebBookLettersPage>;
export type WebBookCoverPageDto = z.output<typeof WebBookCoverPage>;
export type WebBookPagesPageDto = z.output<typeof WebBookPagesPage>;
export type WebBookPreviewPageDto = z.output<typeof WebBookPreviewPage>;
export type WebDealAgreementDto = z.output<typeof WebDealAgreement>;

/** Представление последнего заказа книги, собранное вызывающим (чтобы authoring/ui не импортировал ordering). */
export interface WebBookOrderContext {
  order: { id: string; number: number; status: string; plan: string } | null;
  paid: boolean;
  label: string;
  tone: "warning" | "success" | "info" | "accent" | "neutral" | "danger";
}

export interface RawDealAgreement {
  dealId: string;
  dealNumber: number;
  agreedTotal: number;
  prepaid: number;
  plan: string | null;
  gifts?: WebDealAgreementDto["gifts"];
  deadline: string | null;
  batch?: WebDealAgreementDto["batch"];
  recipient?: string | null;
}

/**
 * Чистые сборщики DTO страниц и оболочки редактора книги (ADR 0012 / ADR 0014):
 * единый источник логики для src/server/v1-local-bridge-book.ts (mybook-api) и apps/backend (NestJS).
 */

export function buildWebBookShellNav(input: {
  book: BookRow;
  locale: Locale;
  userBooks: readonly { book: { id: string }; answered: number; total: number; words: number; photos: number }[];
  letters: readonly Pick<LetterRow, "status">[];
  orderCtx: WebBookOrderContext;
}): WebBookNavResponseDto {
  const { book, locale, userBooks, letters, orderCtx } = input;
  const row = userBooks.find((r) => r.book.id === book.id);
  const answered = row?.answered ?? 0;
  const total = row?.total ?? 0;
  const words = row?.words ?? 0;
  const photos = row?.photos ?? 0;
  const issues = checkReadiness(
    book,
    { answered, total, words, photos, estimatedPages: print.minPages, printedPages: print.minPages, emptyChapters: 0 },
    [],
    locale,
  );
  const coverReady = !issues.some((i) => i.level === "error" && i.href?.endsWith("/cover"));
  const { order, paid, label, tone } = orderCtx;
  const nav: BookNav = bookNav({
    kind: bookKind(book.theme),
    answered,
    total,
    words,
    photos,
    letters: {
      approved: letters.filter((l) => l.status === "approved").length,
      pending: letters.filter((l) => l.status === "pending").length,
    },
    coverReady,
    ordered: book.status !== "draft" || (!!order && order.status !== "cancelled"),
    paid,
    order: order ? { id: order.id, number: order.number, status: order.status, plan: order.plan } : null,
  });
  const shellOrder = book.status === "draft" ? null : nav.order;
  const orderState = book.status !== "draft" && shellOrder ? { label, tone } : null;
  return { nav, orderState };
}

export function buildWebBookHubDto(input: {
  book: BookRow;
  locale: Locale;
  m: Messages;
  stats: BookStats;
  questions: QuestionRow[];
  ownChapters: ChapterRow[];
  photos: PhotoRow[];
  letters: readonly Pick<LetterRow, "status">[];
  built: Pick<BookBuild, "pageCount" | "contentPages"> | null;
  rawAgreement: RawDealAgreement | null;
  orderCtx: WebBookOrderContext;
}): WebBookHubDto {
  const { book, locale, m, stats, questions, ownChapters, photos, letters: letterRows, built, rawAgreement, orderCtx } = input;
  const printedPages = built?.pageCount ?? stats.printedPages;
  const contentPages = built?.contentPages ?? stats.estimatedPages;
  const agreement: WebDealAgreementDto | null = rawAgreement
    ? {
        dealId: rawAgreement.dealId,
        dealNumber: rawAgreement.dealNumber,
        agreedTotal: rawAgreement.agreedTotal,
        prepaid: rawAgreement.prepaid,
        plan: rawAgreement.plan,
        ...(rawAgreement.gifts !== undefined ? { gifts: rawAgreement.gifts } : {}),
        deadline: rawAgreement.deadline,
        ...(rawAgreement.batch !== undefined ? { batch: rawAgreement.batch } : {}),
        ...(rawAgreement.recipient !== undefined ? { recipient: rawAgreement.recipient } : {}),
      }
    : null;
  const letterStats = {
    approved: letterRows.filter((l) => l.status === "approved").length,
    pending: letterRows.filter((l) => l.status === "pending").length,
  };
  const t = m.books.hub;
  const s = m.bookStudio.hub;
  const nv = m.bookStudio.nav;
  const c = m.common;
  const theme = getTheme(book.theme, book.language);
  const g = (x: string) => applyGender(x, book.authorGender, book.recipientGender);
  const kind = bookKind(book.theme);
  const ownTitles = new Map(ownChapters.map((ch) => [ch.key, ch.title.trim()]));
  const titleOf = (key: string) =>
    kind === "blank" ? ownTitles.get(key) || messagesFor(book.language).book.untitledChapter : g(chapterTitle(theme, key, book.language));
  const editable = book.status === "draft";
  const blank = kind === "blank";
  const base = `/books/${book.id}`;
  const percent = blank ? Math.min(100, Math.round((stats.words / BLANK_READY_WORDS) * 100)) : stats.total ? Math.round((stats.answered / stats.total) * 100) : 0;
  const chapters = hubChapters(book.theme, ownChapters, questions, titleOf);
  const sectionHref = (sid: string | null) => sectionLink(book.id, sid);
  const next = questions.find((q) => !q.answer.trim()) ?? null;
  const nextChapter = next ? chapters.find((ch) => ch.key === next.chapter) : null;
  const nextTexts = next ? questionTexts(next, book) : null;
  const nextLabel =
    next && nextTexts
      ? sectionLabel(
          { prompt: nextTexts.prompt, defaultTitle: nextTexts.title, displayText: next.displayText, hideHeading: next.hideHeading },
          kind,
          m.books.untitledSection,
        )
      : "";
  const cta =
    blank && chapters.length === 0
      ? { href: `${base}/questions`, eyebrow: t.createFirstChapter, label: t.createFirstChapterText }
      : next
        ? {
            href: sectionHref(next.id),
            eyebrow: `${blank || stats.answered ? (blank ? t.continueWriting : t.nextQuestion) : t.firstQuestion}${nextChapter ? ` · ${nextChapter.title}` : ""}`,
            label: nextLabel,
          }
        : blank
          ? { href: sectionHref(questions[0]?.id ?? null), eyebrow: t.continueWriting, label: t.openEditor }
          : null;

  const issues = editable ? checkReadiness(book, { ...stats, estimatedPages: contentPages }, photos, locale) : [];
  const coverIssue = issues.find((i) => i.level === "error" && i.href?.endsWith("/cover")) ?? null;
  const { order, paid, label: orderLabel } = orderCtx;
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
  const needs = nav.textDone ? issues : issues.filter((i) => i.level === "error" && !i.href?.endsWith("/questions"));
  const hasErrors = needs.some((i) => i.level === "error");

  const a = s.path.actions;
  const stepOf = (key: StepKey) => {
    const st = nav.steps.find((x) => x.key === key)!;
    return { status: st.status, fraction: st.fraction };
  };
  const rows: WebBookHubDto["rows"] = [
    {
      key: "write",
      href: stepHref(book.id, "questions", nav),
      title: blank ? nv.steps.text : nv.groups.write,
      value: blank
        ? t.blankStats(stats.total, stats.words)
        : `${stats.total ? `${c.count.answers(stats.answered)} ${s.facts.of(stats.total)}` : c.count.answers(stats.answered)}, ${c.count.words(stats.words)}`,
      action: !editable ? a.open : nav.textDone ? a.open : stats.answered || stats.words ? a.continue : a.start,
      bar: percent,
      ...stepOf("questions"),
      active: nav.current === "questions",
    },
    {
      key: "photos",
      href: stepHref(book.id, "photos", nav),
      title: nv.groups.photos,
      value: photos.length ? c.count.photos(photos.length) : s.path.photosHint,
      action: photos.length ? a.manage : a.add,
      ...stepOf("photos"),
      active: false,
    },
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
  let card: WebBookHubDto["card"] = null;
  if (!editable || reopened) {
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
    card = {
      eyebrow: cta.eyebrow,
      title: cta.label,
      serif: true,
      lang: book.language,
      primary: { href: cta.href, label: next && !blank ? t.answerCta : t.writeCta, icon: true },
    };
  } else if (coverIssue) {
    card = { eyebrow: s.next.label, title: s.next.coverTitle, text: coverIssue.text, primary: { href: `${base}/cover`, label: s.next.openCover } };
  } else if (nav.ready || nav.textDone) {
    card = {
      eyebrow: s.next.readyEyebrow,
      title: s.next.readyTitle,
      text: s.next.readyText,
      primary: { href: `${base}/checkout`, label: s.next.order },
      secondary: { href: `${base}/preview`, label: s.next.openPreview },
      ...(cta && (blank || unanswered)
        ? { more: { href: cta.href, label: s.next.keepWriting, text: blank ? "" : s.next.moreToWrite(unanswered) } }
        : {}),
    };
  }

  const letters = {
    href: `${base}/letters`,
    title: s.lower.lettersTitle,
    text:
      letterStats.approved || letterStats.pending
        ? s.lower.lettersState(letterStats.approved, letterStats.pending)
        : book.inviteToken
          ? s.lower.lettersInvited
          : s.lower.lettersEmpty,
    action: letterStats.pending
      ? s.lower.lettersReview(letterStats.pending)
      : book.inviteToken
        ? s.lower.lettersOpen
        : s.lower.lettersCreate,
  };

  return {
    stats,
    photos: photos.map((p) => ({ id: p.id, width: p.width, height: p.height })),
    printedPages,
    agreement,
    letterStats,
    letters,
    kind,
    blank,
    editable,
    percent,
    chapters,
    nav,
    rows,
    card,
    needs,
    hasErrors,
    deadline: editable ? buildHubDeadline(book.occasion, book.occasionDate, stats.answered, m) : null,
    preview: { href: `${base}/preview`, tab: nv.previewTab, cta: nv.previewCta },
  };
}

export function buildWebBookQuestionsPageDto(input: {
  book: BookRow;
  viewer: BookViewer;
  questions: QuestionRow[];
  chapters: ChapterRow[];
  photos: PhotoRow[];
  letters: LetterRow[];
  proofreadAi: boolean;
  writerAi: boolean;
  maxPhotos: number;
}): WebBookQuestionsPageDto {
  const { book, viewer, questions, chapters, photos, letters, proofreadAi, writerAi, maxPhotos } = input;
  const model = editorModel(book, questions, chapters, photos, letters);
  const editable = book.status === "draft" && isBookEditableBy(book.userId, viewer);
  const { coverPhotos, ...edBook } = editorBook(book, model.coverPhotos);
  return {
    epigraphs: model.epigraphs,
    book: {
      ...edBook,
      interiorStyle: asRecord(edBook.interiorStyle),
      ...(coverPhotos
        ? { coverPhotos: { front: [...coverPhotos.front], back: [...coverPhotos.back] } }
        : {}),
    },
    proofreadAi,
    writerAi,
    initialQuestions: model.questions,
    chapters: model.chapters,
    initialPhotos: model.photos,
    maxPhotos,
    letters: model.letters,
    editable,
  };
}

export function buildWebBookPhotosPageDto(input: {
  book: BookRow;
  editable: boolean;
  m: Messages;
  photos: PhotoRow[];
  questions: QuestionRow[];
  chapters: ChapterRow[];
  letters: LetterRow[];
  editedPhotoIds: ReadonlySet<string>;
  maxPhotos: number;
}): WebBookPhotosPageDto {
  const { book, editable, m, photos, questions, chapters, letters, editedPhotoIds, maxPhotos } = input;
  const covered = withCoverPhotos(
    book,
    photos.map((p) => p.id),
  );
  const content = buildBookContent(covered, questions, photos.map(toPhotoItem), chapters, undefined, letters);
  const places = photoPlaceOf(content, photos, covered);
  const losses = photoLosses(content);

  const printed = new Map<string, { title: string; number: number | null; epigraph?: string }>(
    content.chapters.flatMap((ch) => [
      [ch.key, { title: ch.title, number: ch.number, epigraph: ch.epigraph }] as const,
      ...(ch.folded ?? []).map((f) => [f.key, { title: f.title, number: null }] as const),
    ]),
  );
  const untitled = messagesFor(book.language).book.untitledChapter;
  const ownTitle = (key: string) => book.tocLines?.[tocKey.chapter(key)]?.title?.trim();
  const model = editorModel(book, questions, chapters, photos);
  const placeChapters: WebBookPhotosPageDto["chapters"] = model.chapters.map((ch) => {
    const p = printed.get(ch.key);
    const epigraph = p?.epigraph ?? ch.epigraph;
    return {
      key: ch.key,
      title: p?.title || ownTitle(ch.key) || ch.title || untitled,
      number: p?.number ?? null,
      ...(epigraph !== undefined ? { epigraph } : {}),
      printed: !!p,
    };
  });
  for (const [key, p] of printed) {
    if (!placeChapters.some((ch) => ch.key === key)) {
      placeChapters.push({
        key,
        title: p.title,
        number: p.number,
        ...(p.epigraph !== undefined ? { epigraph: p.epigraph } : {}),
        printed: true,
      });
    }
  }

  return {
    book: {
      id: book.id,
      interior: book.interior,
      format: book.format,
      language: book.language,
      blank: bookKind(book.theme) === "blank",
      photoPlacement: book.photoPlacement,
      galleryTitle: content.galleryTitle,
      editable,
      layoutRev: book.layoutRev,
    },
    photos: photos.map((p) => ({
      id: p.id,
      width: p.width,
      height: p.height,
      caption: p.caption,
      layout: p.layout,
      questionId: p.questionId,
      chapter: p.chapter ?? null,
      opener: p.opener ?? false,
      crop: p.crop ?? null,
      version: photoVersion(p.storageKey),
      edited: editedPhotoIds.has(p.id),
    })),
    places: placesToEntries(places),
    chapters: placeChapters,
    answers: questions.map((r) => ({ id: r.id, title: questionTexts(r, book).heading.trim() || m.books.photos.answer, chapterKey: r.chapter })),
    tocLines: book.tocLines ?? {},
    losses: Object.fromEntries(losses),
    maxPhotos,
  };
}

export function buildWebBookLettersPageDto(letters: readonly LetterRow[]): WebBookLettersPageDto {
  return {
    letters: letters.map((l) => ({
      id: l.id,
      authorName: l.authorName,
      relation: l.relation,
      text: l.text,
      status: l.status,
      createdAt: l.createdAt.toISOString(),
    })),
  };
}

export function buildWebBookCoverPageDto(input: {
  book: BookRow;
  locale: Locale;
  m: Messages;
  photos: PhotoRow[];
  questions: QuestionRow[];
  chapters: ChapterRow[];
  stats: Pick<BookStats, "printedPages">;
  built: Pick<BookBuild, "pageCount"> | null;
}): WebBookCoverPageDto {
  const { book, locale, m, photos, questions, chapters, stats, built } = input;
  const theme = getTheme(book.theme, locale);
  const covered = withCoverPhotos(
    book,
    photos.map((p) => p.id),
  );
  const content = buildBookContent(covered, questions, photos.map(toPhotoItem), chapters);
  const places = photoPlaceOf(content, photos, covered);
  const placeNames = {
    chapters: [
      ...editorModel(book, questions, chapters, photos).chapters.map((ch) => ({ key: ch.key, title: ch.title })),
      ...content.chapters.flatMap((ch) => [
        { key: ch.key, title: ch.title },
        ...(ch.folded ?? []).map((f) => ({ key: f.key, title: f.title })),
      ]),
    ],
    answers: questions.map((q) => ({ id: q.id, title: questionTexts(q, book).heading.trim() || m.books.photos.answer })),
  };
  return {
    defaultTitle: buildBookContent({ ...book, title: "" }, [], [], chapters).title,
    pages: built?.pageCount ?? stats.printedPages,
    recipientLabel: theme.recipientLabel ?? "",
    sample: normalizeSpreadSample(bookSpreadSample(book, questions, chapters, m.books.pages.dedicationEmpty, photos)),
    photos: photos.map((p) => ({ id: p.id, width: p.width, height: p.height, opener: p.opener ?? false })),
    places: placesToEntries(places),
    placeNames,
  };
}

export function buildWebBookPagesPageDto(input: {
  book: BookRow;
  viewer: BookViewer;
  m: Messages;
  questions: QuestionRow[];
  chapters: ChapterRow[];
  photos: PhotoRow[];
  letters: LetterRow[];
  screen: Pick<BookBuild, "chapterPages"> | null;
  maxPhotos: number;
}): WebBookPagesPageDto {
  const { book, viewer, m, questions, chapters, photos, letters, screen, maxPhotos } = input;
  const t = m.books.pages;
  const format = getFormat(book.format);
  const spreadSample = bookSpreadSample(book, questions, chapters, t.dedicationEmpty, photos, screen?.chapterPages, letters);
  const covered = withCoverPhotos(
    book,
    photos.map((p) => p.id),
  );
  const built = buildBookContent(covered, questions, photos.map(toPhotoItem), chapters);
  const places = photoPlaceOf(built, photos, covered);

  const printed = new Map<string, { title: string; number: number | null; epigraph?: string }>(
    built.chapters.flatMap((ch) => [
      [ch.key, { title: ch.title, number: ch.number, epigraph: ch.epigraph }] as const,
      ...(ch.folded ?? []).map((f) => [f.key, { title: f.title, number: null }] as const),
    ]),
  );
  const untitled = messagesFor(book.language).book.untitledChapter;
  const ownTitle = (key: string) => book.tocLines?.[tocKey.chapter(key)]?.title?.trim();
  const placeChapters: WebBookPagesPageDto["photos"]["chapters"] = editorModel(book, questions, chapters, photos).chapters.map((ch) => {
    const p = printed.get(ch.key);
    const epigraph = p?.epigraph ?? ch.epigraph;
    return {
      key: ch.key,
      title: p?.title || ownTitle(ch.key) || ch.title || untitled,
      number: p?.number ?? null,
      ...(epigraph !== undefined ? { epigraph } : {}),
      printed: !!p,
    };
  });
  for (const [key, p] of printed) {
    if (!placeChapters.some((ch) => ch.key === key)) {
      placeChapters.push({
        key,
        title: p.title,
        number: p.number,
        ...(p.epigraph !== undefined ? { epigraph: p.epigraph } : {}),
        printed: true,
      });
    }
  }
  const frame = openerFrame(format, getInteriorDesign(book.interior));
  const fit = frame
    ? Object.fromEntries(
        placeChapters
          .filter((ch) => ch.printed && isChapterPhotoKey(ch.key))
          .map((ch) => [ch.key, suggestOpener(built, photos, frame, ch.key, covered).slice(0, SUGGEST_TOP).map((x) => x.id)]),
      )
    : {};
  const stories = Object.fromEntries(
    questions.map((q) => [q.id, { title: questionTexts(q, book).title, displayText: q.displayText, hidden: q.hideHeading, pageBreak: q.pageBreak }]),
  );

  return {
    sample: normalizeSpreadSample(spreadSample),
    exactPages: screen?.chapterPages ?? null,
    stories,
    photos: {
      book: {
        id: book.id,
        interior: getInteriorDesign(book.interior).id,
        format: book.format,
        language: book.language,
        blank: bookKind(book.theme) === "blank",
        photoPlacement: book.photoPlacement,
        galleryTitle: built.galleryTitle,
        editable: book.status === "draft" && isBookEditableBy(book.userId, viewer),
        layoutRev: book.layoutRev,
      },
      photos: photos.map((p) => ({
        id: p.id,
        width: p.width,
        height: p.height,
        caption: p.caption,
        layout: p.layout,
        questionId: p.questionId,
        chapter: p.chapter ?? null,
        opener: p.opener ?? false,
        crop: p.crop ?? null,
      })),
      places: placesToEntries(places),
      chapters: placeChapters,
      answers: questions.map((r) => ({ id: r.id, title: questionTexts(r, book).heading.trim() || m.books.photos.answer, chapterKey: r.chapter })),
      fit,
      maxPhotos,
    },
  };
}

export function buildWebBookPreviewPageDto(input: {
  book: BookRow;
  viewer: BookViewer;
  questions: QuestionRow[];
  bundle: Pick<BookBundle, "chapters" | "photos" | "letters"> | null;
}): WebBookPreviewPageDto {
  const { book, viewer, questions, bundle } = input;
  const chapters = bundle?.chapters ?? [];
  const allPhotos = bundle?.photos ?? [];
  const letters = bundle?.letters ?? [];

  const content = buildBookContent(book, questions, allPhotos.map(toPhotoItem), chapters, undefined, letters);
  const backPhotos = backPhotoIds(book).flatMap((id) => allPhotos.filter((p) => p.id === id));
  const names = coverNames(book);
  const coverPhotos = coverPhotoRefs(coverPhotoIds(book), allPhotos, book, "view").map((p) => p ?? null);
  const title = printedCoverTitle(book, !!parseCoverDesign(book.coverDesign), content.title);
  const design = asRecordOrNull(book.coverDesign);
  const back = asRecordOrNull(book.coverBack);

  return {
    flipbook: {
      cover: {
        template: book.coverTemplate,
        ...(book.coverLines === false ? { lines: false } : {}),
        format: book.format,
        title,
        subtitle: book.subtitle,
        names,
        photos: coverPhotos,
        ...(design ? { design } : {}),
        ...(back ? { back } : {}),
      },
      formatId: content.format.id,
      title,
      model: {
        brand: site.name.toUpperCase(),
        back: backContent(
          book,
          backPhotos.map((p) => ({ width: p.width, height: p.height })),
          new Date(),
        ),
        backPhotos: backPhotoRefs(backPhotos, book, "view"),
      },
    },
    editable: book.status === "draft" && isBookEditableBy(book.userId, viewer),
  };
}
