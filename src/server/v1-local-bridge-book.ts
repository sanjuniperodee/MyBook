import "server-only";
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
  WebBookRow,
  WebDealAgreement,
  WebSpreadSample,
} from "@mybook/contracts";
import { site } from "@/config/site";
import { isLocale, type Locale } from "@/i18n/config";
import { coverName, interiorName } from "@/i18n/labels";
import { messagesFor, type Messages } from "@/i18n/messages";
import { buildBookContent } from "@/lib/book/book-content";
import { bookNav, stepHref, type BookNav, type StepKey } from "@/lib/book/book-nav";
import { backContent, backPhotoIds } from "@/lib/book/cover-back";
import { parseCoverDesign } from "@/lib/book/cover-design";
import { coverNames, printedCoverTitle } from "@/lib/book/cover-names";
import { withCoverPhotos } from "@/lib/book/cover-photos";
import { coverPhotoIds } from "@/lib/book/covers";
import { editorBook, editorModel } from "@/lib/book/editor-data";
import { getFormat, print } from "@/lib/book/formats";
import { hubChapters, sectionHref as sectionLink } from "@/lib/book/hub-model";
import { getInteriorDesign } from "@/lib/book/interiors";
import { isChapterPhotoKey, questionTexts, toPhotoItem } from "@/lib/book/layout";
import { SUGGEST_TOP, suggestOpener } from "@/lib/book/opener-suggest";
import { photoLosses } from "@/lib/book/photo-loss";
import { openerFrame } from "@/lib/book/photo-pages";
import { photoPlaceOf, type PhotoPlace } from "@/lib/book/photo-place";
import { backPhotoRefs, coverPhotoRefs } from "@/lib/book/photo-refs";
import { tocKey } from "@/lib/book/toc";
import { applyGender } from "@/lib/content/gender";
import { BLANK_READY_WORDS, bookKind } from "@/lib/content/kinds";
import { chapterTitle, getTheme } from "@/lib/content/themes";
import { nowMs } from "@/lib/dates";
import { deadlineFor, getOccasion, parseDay } from "@/lib/occasions";
import { photoVersion } from "@/lib/photo-edit/doc";
import type { BookRow, BookViewer } from "@/modules/authoring";
import type { OrderStatus } from "@/shared/domain/orders";
import type { User } from "./auth";
import { bookSpreadSample } from "./spreadSample";

/**
 * Мост легаси `local()` фолбэков для страниц книги (ADR 0012, A5 — Раздел 2A, section: "book"):
 * НИКАКИХ статических top-level импортов `./container`, `./access`, `./photoLimit`, `pg` или `@/modules/*`.
 * На Vercel без `DATABASE_URL` (`webApiOnly() === true`) локальные функции не вызываются и модуль БД не загружается.
 */

export type WebBookRowDto = z.output<typeof WebBookRow>;
export type WebBookNavDto = z.output<typeof WebBookNav>;
export type WebBookNavResponseDto = z.output<typeof WebBookNavResponse>;
export type WebBookHubDto = z.output<typeof WebBookHubResponse>;
export type WebBookQuestionsPageDto = z.output<typeof WebBookQuestionsPage>;
export type WebBookPhotosPageDto = z.output<typeof WebBookPhotosPage>;
export type WebBookLettersPageDto = z.output<typeof WebBookLettersPage>;
export type WebBookCoverPageDto = z.output<typeof WebBookCoverPage>;
export type WebBookPagesPageDto = z.output<typeof WebBookPagesPage>;
export type WebBookPreviewPageDto = z.output<typeof WebBookPreviewPage>;

type WebDealAgreementDto = z.output<typeof WebDealAgreement>;
type WebSpreadSampleDto = z.output<typeof WebSpreadSample>;

/** Сколько ответов считаем «полноценной книгой» для расчёта темпа (как DeadlineBanner). */
const GOOD_BOOK_ANSWERS = 30;

const toIsoOrEpoch = (d: Date | string | null | undefined): string =>
  d instanceof Date ? d.toISOString() : typeof d === "string" ? d : new Date(0).toISOString();

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

const asRecordOrNull = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

const placesToEntries = (places: ReadonlyMap<string, PhotoPlace>) =>
  [...places.entries()].map(([id, place]) => ({ id, place }));

export const entriesToPlacePairs = (entries: readonly { id: string; place: PhotoPlace }[]): [string, PhotoPlace][] =>
  entries.map((e) => [e.id, e.place]);

function normalizeSpreadSample(raw: ReturnType<typeof bookSpreadSample>): WebSpreadSampleDto {
  return {
    ...raw,
    toc: raw.toc.map((l) => ({ ...l })),
    ...(raw.captions ? { captions: [...raw.captions] } : {}),
  };
}

// ─── Базовая запись книги (getAccessibleBook / viewerOf) ────────────────────────────────────────────────────

export function toWebBookRow(book: BookRow): WebBookRowDto {
  return {
    id: book.id,
    userId: book.userId,
    theme: book.theme,
    status: book.status,
    title: book.title,
    subtitle: book.subtitle,
    authorName: book.authorName,
    authorGender: book.authorGender,
    recordedBy: book.recordedBy,
    recipientName: book.recipientName,
    recipientGender: book.recipientGender,
    namesOnCover: book.namesOnCover,
    hideRecipientOnCover: book.hideRecipientOnCover,
    coverLines: book.coverLines,
    coverTemplate: book.coverTemplate,
    coverPhotoId: book.coverPhotoId ?? null,
    coverPhotoExtra: Array.isArray(book.coverPhotoExtra) ? book.coverPhotoExtra : [],
    backText: book.backText,
    backLayout: book.backLayout,
    backPhotoId: book.backPhotoId ?? null,
    backPhotoExtra: Array.isArray(book.backPhotoExtra) ? book.backPhotoExtra : [],
    photoFrames: (book.photoFrames && typeof book.photoFrames === "object" && !Array.isArray(book.photoFrames)
      ? book.photoFrames
      : {}) as WebBookRowDto["photoFrames"],
    dedication: book.dedication,
    interior: book.interior,
    interiorStyle: asRecord(book.interiorStyle),
    coverDesign: asRecordOrNull(book.coverDesign),
    coverBack: asRecordOrNull(book.coverBack),
    format: book.format,
    photoPlacement: book.photoPlacement,
    showToc: book.showToc,
    tocMode: book.tocMode,
    tocLines: (book.tocLines && typeof book.tocLines === "object" && !Array.isArray(book.tocLines)
      ? book.tocLines
      : {}) as WebBookRowDto["tocLines"],
    layoutRev: book.layoutRev,
    paginationRev: book.paginationRev,
    inviteToken: book.inviteToken ?? null,
    inviteText: book.inviteText,
    endText: book.endText ?? null,
    chapterStart: book.chapterStart,
    titlePage: book.titlePage,
    language: isLocale(book.language) ? book.language : "ru",
    occasion: book.occasion ?? null,
    occasionDate: book.occasionDate ?? null,
    createdAt: toIsoOrEpoch(book.createdAt),
    updatedAt: toIsoOrEpoch(book.updatedAt),
  };
}

export function fromWebBookRow(dto: WebBookRowDto): BookRow {
  return {
    ...dto,
    createdAt: new Date(dto.createdAt),
    updatedAt: new Date(dto.updatedAt),
  };
}

export async function localViewerOf(user: Pick<User, "id" | "role" | "staffDisabled">, bookId?: string | null): Promise<BookViewer> {
  const isStaffUser = user.role === "admin" && !user.staffDisabled;
  if (!isStaffUser) return { userId: user.id, isStaff: false, staffEdits: false };
  const { can, canSeeBook, getStaff } = await import("./access");
  const staff = await getStaff();
  const own = staff?.user.id === user.id ? staff : null;
  const sees = can(own, "clients.view") && (own!.scope === "all" || (!!bookId && (await canSeeBook(own!, bookId))));
  const acting = sees ? own : null;
  return { userId: user.id, isStaff: can(acting, "clients.view"), staffEdits: can(acting, "clients.view", "clients.edit") };
}

export async function localVisibleBook(bookId: string, user: Pick<User, "id" | "role" | "staffDisabled">): Promise<BookRow | null> {
  const { container } = await import("./container");
  return container().authoring.queries.visibleBook(bookId, await localViewerOf(user, bookId));
}

// ─── Навигация и оболочка книги (layout.tsx, nav-data.ts) ───────────────────────────────────────────────────

export async function localBookShellNav(book: BookRow, locale: Locale): Promise<WebBookNavResponseDto> {
  const [{ container }, { checkReadiness }, { isPaid }, { isPrintedPlan, orderStatusLabel, orderStatusTone }] = await Promise.all([
    import("./container"),
    import("@/modules/authoring/domain/readiness"),
    import("@/modules/ordering/domain"),
    import("@/modules/ordering/ui/status"),
  ]);
  const c = container();
  const [rows, letters, order] = await Promise.all([
    c.authoring.queries.userBooks(book.userId),
    c.authoring.queries.letters(book.id),
    c.ordering.queries.lastOrderOfBook(book.id),
  ]);
  const row = rows.find((r) => r.book.id === book.id);
  const answered = row?.answered ?? 0;
  const total = row?.total ?? 0;
  const words = row?.words ?? 0;
  const photos = row?.photos ?? 0;
  // Готовность обложки — те же проверки, что перед заказом: только ошибки раздела «Обложка».
  const issues = checkReadiness(
    book,
    { answered, total, words, photos, estimatedPages: print.minPages, printedPages: print.minPages, emptyChapters: 0 },
    [],
    locale,
  );
  const coverReady = !issues.some((i) => i.level === "error" && i.href?.endsWith("/cover"));
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
    // Открытая для правок книга с живым заказом — тоже «заказана»: шаг «Заказ» ведёт в её заказ, а не к оформлению нового.
    ordered: book.status !== "draft" || (!!order && order.status !== "cancelled"),
    paid: !!order && isPaid(order.status),
    order: order ? { id: order.id, number: order.number, status: order.status, plan: order.plan } : null,
  });
  const shellOrder = book.status === "draft" ? null : nav.order;
  const orderState =
    book.status !== "draft" && shellOrder
      ? {
          label: orderStatusLabel(shellOrder.status, locale, isPrintedPlan(shellOrder.plan)),
          tone: orderStatusTone[shellOrder.status as OrderStatus] ?? "neutral",
        }
      : null;
  return { nav, orderState };
}

export async function localBookNav(book: BookRow, locale: Locale): Promise<BookNav> {
  return (await localBookShellNav(book, locale)).nav;
}

// ─── Штаб книги (book-hub.ts, books/[id]/page.tsx) ─────────────────────────────────────────────────────────

/** Срок к празднику для обзора книги — те же строки, что DeadlineBanner. */
export function buildHubDeadline(occasion: string | null, occasionDate: string | null, answered: number, m: Messages): WebBookHubDto["deadline"] {
  const o = getOccasion(occasion);
  if (!o || !occasionDate) return null;
  const c = m.common;
  const dl = deadlineFor(occasionDate, new Date(nowMs()));
  if (dl.state === "past") return null;
  const left = Math.max(0, GOOD_BOOK_ANSWERS - answered);
  const perDay = left && dl.daysToOrder > 0 ? Math.ceil(left / dl.daysToOrder) : 0;
  const tone = dl.state === "relaxed" ? "calm" : dl.state === "soon" ? "warm" : "hot";
  const line =
    dl.state === "digital"
      ? c.deadline.digital
      : dl.state === "premium"
        ? c.deadline.premium(dl.orderByPremium)
        : `${c.deadline.orderBy(dl.orderBy, dl.daysToOrder)}${perDay ? c.deadline.pace(perDay) : ""}`;
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

export async function localBookHubDto(book: BookRow, locale: Locale, m: Messages): Promise<WebBookHubDto> {
  const [{ container }, { isPrintedPlan, orderStatusLabel }, { isPaid }, { checkReadiness }] = await Promise.all([
    import("./container"),
    import("@/modules/ordering/ui/status"),
    import("@/modules/ordering/domain"),
    import("@/modules/authoring/domain/readiness"),
  ]);
  const cContainer = container();
  const [stats, questions, ownChapters, photos, order, letterRows, built] = await Promise.all([
    cContainer.authoring.queries.stats(book),
    cContainer.authoring.queries.questions(book.id),
    cContainer.authoring.queries.chapters(book.id),
    cContainer.authoring.queries.photos(book.id),
    cContainer.ordering.queries.lastOrderOfBook(book.id),
    cContainer.authoring.queries.letters(book.id),
    // Готовый макет текущей книги — точное число страниц (как в предпросмотре); нет — оценка со знаком «≈».
    cContainer.previews.current(book.id).catch(() => null),
  ]);
  const printedPages = built?.pageCount ?? stats.printedPages;
  const contentPages = built?.contentPages ?? stats.estimatedPages;
  const rawAgreement = book.status === "draft" ? await cContainer.ordering.orders.agreementFor(book.userId) : null;
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
      ? (await import("@/lib/book/editor-model")).sectionLabel(
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
  const paid = !!order && isPaid(order.status);
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

// ─── Страница вопросов и ответов (questions/page.tsx) ───────────────────────────────────────────────────────

export async function localQuestionsPageDto(book: BookRow, viewer: BookViewer): Promise<WebBookQuestionsPageDto> {
  const [{ container }, { maxPhotos }, { isBookEditableBy }] = await Promise.all([
    import("./container"),
    import("./photoLimit"),
    import("@/modules/authoring"),
  ]);
  const c = container();
  const [rows, chapters, photos, letters, proofreadAi, writerAi, limit] = await Promise.all([
    c.authoring.queries.questions(book.id),
    c.authoring.queries.chapters(book.id),
    c.authoring.queries.photos(book.id),
    c.authoring.queries.approvedLetters(book.id),
    book.status === "draft" ? c.assistant.proofreader.configured() : false,
    book.status === "draft" ? c.assistant.writer.configured() : false,
    maxPhotos(),
  ]);
  const model = editorModel(book, rows, chapters, photos, letters);
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
    maxPhotos: limit,
    letters: model.letters,
    editable,
  };
}

export async function localQuestionsPageDtoForUser(book: BookRow, user: Pick<User, "id" | "role" | "staffDisabled">): Promise<WebBookQuestionsPageDto> {
  return localQuestionsPageDto(book, await localViewerOf(user, book.id));
}

// ─── Страница фото (photos/page.tsx, photos/photos-data.ts) ─────────────────────────────────────────────────

export async function localPhotosTabDto(book: BookRow, editable: boolean, m: Messages): Promise<WebBookPhotosPageDto> {
  const [{ container }, { maxPhotos }] = await Promise.all([import("./container"), import("./photoLimit")]);
  const q = container().authoring.queries;
  const [photos, questions, chapters, letters, edited, limit] = await Promise.all([
    q.photos(book.id),
    q.questions(book.id),
    q.chapters(book.id),
    q.approvedLetters(book.id),
    q.editedPhotoIds(book.id),
    maxPhotos(),
  ]);
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
      edited: edited.has(p.id),
    })),
    places: placesToEntries(places),
    chapters: placeChapters,
    answers: questions.map((r) => ({ id: r.id, title: questionTexts(r, book).heading.trim() || m.books.photos.answer, chapterKey: r.chapter })),
    tocLines: book.tocLines ?? {},
    losses: Object.fromEntries(losses),
    maxPhotos: limit,
  };
}

export async function localPhotosPageDto(book: BookRow, viewer: BookViewer, m: Messages): Promise<WebBookPhotosPageDto> {
  const { isBookEditableBy } = await import("@/modules/authoring");
  const editable = book.status === "draft" && isBookEditableBy(book.userId, viewer);
  return localPhotosTabDto(book, editable, m);
}

export async function localPhotosPageDtoForUser(
  book: BookRow,
  user: Pick<User, "id" | "role" | "staffDisabled">,
  m: Messages,
): Promise<WebBookPhotosPageDto> {
  return localPhotosPageDto(book, await localViewerOf(user, book.id), m);
}

// ─── Страница писем близких (letters/page.tsx) ──────────────────────────────────────────────────────────────

export async function localLettersPageDto(bookId: string): Promise<WebBookLettersPageDto> {
  const { container } = await import("./container");
  const letters = await container().authoring.queries.letters(bookId);
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

// ─── Страница обложки (cover/page.tsx) ──────────────────────────────────────────────────────────────────────

export async function localCoverPageDto(book: BookRow, locale: Locale, m: Messages): Promise<WebBookCoverPageDto> {
  const { container } = await import("./container");
  const c = container();
  const [photos, questions, chapters, stats, built] = await Promise.all([
    c.authoring.queries.photos(book.id),
    c.authoring.queries.questions(book.id),
    c.authoring.queries.chapters(book.id),
    c.authoring.queries.stats(book),
    c.previews.current(book.id).catch(() => null),
  ]);
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

// ─── Страница вёрстки / страниц (pages/page.tsx) ────────────────────────────────────────────────────────────

export async function localPagesPageDto(book: BookRow, viewer: BookViewer, m: Messages): Promise<WebBookPagesPageDto> {
  const [{ container }, { maxPhotos }, { isBookEditableBy }] = await Promise.all([
    import("./container"),
    import("./photoLimit"),
    import("@/modules/authoring"),
  ]);
  const c = container();
  const [questions, chapters, photos, letters, screen, limit] = await Promise.all([
    c.authoring.queries.questions(book.id),
    c.authoring.queries.chapters(book.id),
    c.authoring.queries.photos(book.id),
    c.authoring.queries.approvedLetters(book.id),
    c.previews.current(book.id).catch(() => null),
    maxPhotos(),
  ]);
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
      maxPhotos: limit,
    },
  };
}

export async function localPagesPageDtoForUser(
  book: BookRow,
  user: Pick<User, "id" | "role" | "staffDisabled">,
  m: Messages,
): Promise<WebBookPagesPageDto> {
  return localPagesPageDto(book, await localViewerOf(user, book.id), m);
}

// ─── Страница превью (preview/page.tsx) ─────────────────────────────────────────────────────────────────────

export async function localPreviewPageDto(book: BookRow, viewer: BookViewer): Promise<WebBookPreviewPageDto> {
  const [{ container }, { isBookEditableBy }] = await Promise.all([import("./container"), import("@/modules/authoring")]);
  const q = container().authoring.queries;
  const [questions, bundle] = await Promise.all([q.questions(book.id), q.bundle(book.id)]);
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

export async function localPreviewPageDtoForUser(book: BookRow, user: Pick<User, "id" | "role" | "staffDisabled">): Promise<WebBookPreviewPageDto> {
  return localPreviewPageDto(book, await localViewerOf(user, book.id));
}
