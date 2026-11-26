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
} from "@mybook/contracts";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";
import type { BookNav } from "@/lib/book/book-nav";
import { buildHubDeadline, entriesToPlacePairs, fromWebBookRow, toWebBookRow, type WebBookRowDto } from "@/lib/book/web-book-row";
import type { BookRow, BookViewer } from "@/modules/authoring";
import type { OrderStatus } from "@/shared/domain/orders";
import type { User } from "./auth";

/**
 * Мост легаси `local()` фолбэков для страниц книги (ADR 0012, A5 — Раздел 2A, section: "book"):
 * НИКАКИХ статических top-level импортов `./container`, `./access`, `./photoLimit`, `pg` или `@/modules/*`.
 * Сборка самих DTO вынесена в чистый модуль `@/modules/authoring/ui/webBookPagesView` (общий с бэкендом на Nest, ADR 0014).
 */

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

// ─── Базовая запись книги (getAccessibleBook / viewerOf) ────────────────────────────────────────────────────

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
  const [{ container }, { buildWebBookShellNav }, { isPaid }, { isPrintedPlan, orderStatusLabel, orderStatusTone }] = await Promise.all([
    import("./container"),
    import("@/modules/authoring/ui/webBookPagesView"),
    import("@/modules/ordering/domain"),
    import("@/modules/ordering/ui/status"),
  ]);
  const c = container();
  const [userBooks, letters, order] = await Promise.all([
    c.authoring.queries.userBooks(book.userId),
    c.authoring.queries.letters(book.id),
    c.ordering.queries.lastOrderOfBook(book.id),
  ]);
  return buildWebBookShellNav({
    book,
    locale,
    userBooks,
    letters,
    orderCtx: {
      order: order ? { id: order.id, number: order.number, status: order.status, plan: order.plan } : null,
      paid: !!order && isPaid(order.status),
      label: order ? orderStatusLabel(order.status, locale, isPrintedPlan(order.plan)) : "",
      tone: order ? (orderStatusTone[order.status as OrderStatus] ?? "neutral") : "neutral",
    },
  });
}

export async function localBookNav(book: BookRow, locale: Locale): Promise<BookNav> {
  return (await localBookShellNav(book, locale)).nav;
}

// ─── Штаб книги (book-hub.ts, books/[id]/page.tsx) ─────────────────────────────────────────────────────────

export async function localBookHubDto(book: BookRow, locale: Locale, m: Messages): Promise<WebBookHubDto> {
  const [{ container }, { buildWebBookHubDto }, { isPrintedPlan, orderStatusLabel, orderStatusTone }, { isPaid }] = await Promise.all([
    import("./container"),
    import("@/modules/authoring/ui/webBookPagesView"),
    import("@/modules/ordering/ui/status"),
    import("@/modules/ordering/domain"),
  ]);
  const cContainer = container();
  const [stats, questions, ownChapters, photos, order, letters, built] = await Promise.all([
    cContainer.authoring.queries.stats(book),
    cContainer.authoring.queries.questions(book.id),
    cContainer.authoring.queries.chapters(book.id),
    cContainer.authoring.queries.photos(book.id),
    cContainer.ordering.queries.lastOrderOfBook(book.id),
    cContainer.authoring.queries.letters(book.id),
    cContainer.previews.current(book.id).catch(() => null),
  ]);
  const rawAgreement = book.status === "draft" ? await cContainer.ordering.orders.agreementFor(book.userId) : null;
  return buildWebBookHubDto({
    book,
    locale,
    m,
    stats,
    questions,
    ownChapters,
    photos,
    letters,
    built,
    rawAgreement,
    orderCtx: {
      order: order ? { id: order.id, number: order.number, status: order.status, plan: order.plan } : null,
      paid: !!order && isPaid(order.status),
      label: order ? orderStatusLabel(order.status, locale, isPrintedPlan(order.plan)) : "",
      tone: order ? (orderStatusTone[order.status as OrderStatus] ?? "neutral") : "neutral",
    },
  });
}

// ─── Страница вопросов и ответов (questions/page.tsx) ───────────────────────────────────────────────────────

export async function localQuestionsPageDto(book: BookRow, viewer: BookViewer): Promise<WebBookQuestionsPageDto> {
  const [{ container }, { maxPhotos }, { buildWebBookQuestionsPageDto }] = await Promise.all([
    import("./container"),
    import("./photoLimit"),
    import("@/modules/authoring/ui/webBookPagesView"),
  ]);
  const c = container();
  const [questions, chapters, photos, letters, proofreadAi, writerAi, limit] = await Promise.all([
    c.authoring.queries.questions(book.id),
    c.authoring.queries.chapters(book.id),
    c.authoring.queries.photos(book.id),
    c.authoring.queries.approvedLetters(book.id),
    book.status === "draft" ? c.assistant.proofreader.configured() : false,
    book.status === "draft" ? c.assistant.writer.configured() : false,
    maxPhotos(),
  ]);
  return buildWebBookQuestionsPageDto({ book, viewer, questions, chapters, photos, letters, proofreadAi, writerAi, maxPhotos: limit });
}

export async function localQuestionsPageDtoForUser(book: BookRow, user: Pick<User, "id" | "role" | "staffDisabled">): Promise<WebBookQuestionsPageDto> {
  return localQuestionsPageDto(book, await localViewerOf(user, book.id));
}

// ─── Страница фото (photos/page.tsx, photos/photos-data.ts) ─────────────────────────────────────────────────

export async function localPhotosTabDto(book: BookRow, editable: boolean, m: Messages): Promise<WebBookPhotosPageDto> {
  const [{ container }, { maxPhotos }, { buildWebBookPhotosPageDto }] = await Promise.all([
    import("./container"),
    import("./photoLimit"),
    import("@/modules/authoring/ui/webBookPagesView"),
  ]);
  const q = container().authoring.queries;
  const [photos, questions, chapters, letters, editedPhotoIds, limit] = await Promise.all([
    q.photos(book.id),
    q.questions(book.id),
    q.chapters(book.id),
    q.approvedLetters(book.id),
    q.editedPhotoIds(book.id),
    maxPhotos(),
  ]);
  return buildWebBookPhotosPageDto({ book, editable, m, photos, questions, chapters, letters, editedPhotoIds, maxPhotos: limit });
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
  const [{ container }, { buildWebBookLettersPageDto }] = await Promise.all([
    import("./container"),
    import("@/modules/authoring/ui/webBookPagesView"),
  ]);
  return buildWebBookLettersPageDto(await container().authoring.queries.letters(bookId));
}

// ─── Страница обложки (cover/page.tsx) ──────────────────────────────────────────────────────────────────────

export async function localCoverPageDto(book: BookRow, locale: Locale, m: Messages): Promise<WebBookCoverPageDto> {
  const [{ container }, { buildWebBookCoverPageDto }] = await Promise.all([
    import("./container"),
    import("@/modules/authoring/ui/webBookPagesView"),
  ]);
  const c = container();
  const [photos, questions, chapters, stats, built] = await Promise.all([
    c.authoring.queries.photos(book.id),
    c.authoring.queries.questions(book.id),
    c.authoring.queries.chapters(book.id),
    c.authoring.queries.stats(book),
    c.previews.current(book.id).catch(() => null),
  ]);
  return buildWebBookCoverPageDto({ book, locale, m, photos, questions, chapters, stats, built });
}

// ─── Страница вёрстки / страниц (pages/page.tsx) ────────────────────────────────────────────────────────────

export async function localPagesPageDto(book: BookRow, viewer: BookViewer, m: Messages): Promise<WebBookPagesPageDto> {
  const [{ container }, { maxPhotos }, { buildWebBookPagesPageDto }] = await Promise.all([
    import("./container"),
    import("./photoLimit"),
    import("@/modules/authoring/ui/webBookPagesView"),
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
  return buildWebBookPagesPageDto({ book, viewer, m, questions, chapters, photos, letters, screen, maxPhotos: limit });
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
  const [{ container }, { buildWebBookPreviewPageDto }] = await Promise.all([
    import("./container"),
    import("@/modules/authoring/ui/webBookPagesView"),
  ]);
  const q = container().authoring.queries;
  const [questions, bundle] = await Promise.all([q.questions(book.id), q.bundle(book.id)]);
  return buildWebBookPreviewPageDto({ book, viewer, questions, bundle });
}

export async function localPreviewPageDtoForUser(book: BookRow, user: Pick<User, "id" | "role" | "staffDisabled">): Promise<WebBookPreviewPageDto> {
  return localPreviewPageDto(book, await localViewerOf(user, book.id));
}
