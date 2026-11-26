import { Inject, Injectable } from "@nestjs/common";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";
import type { BookRow, BookViewer } from "@/modules/authoring";
import { isBookEditableBy } from "@/modules/authoring/domain";
import {
  buildWebBookCoverPageDto,
  buildWebBookHubDto,
  buildWebBookLettersPageDto,
  buildWebBookPagesPageDto,
  buildWebBookPhotosPageDto,
  buildWebBookPreviewPageDto,
  buildWebBookQuestionsPageDto,
  buildWebBookShellNav,
  entriesToPlacePairs,
  type WebBookCoverPageDto,
  type WebBookHubDto,
  type WebBookLettersPageDto,
  type WebBookNavResponseDto,
  type WebBookOrderContext,
  type WebBookPagesPageDto,
  type WebBookPhotosPageDto,
  type WebBookPreviewPageDto,
  type WebBookQuestionsPageDto,
} from "@/modules/authoring/ui/webBookPagesView";
import { isPaid } from "@/modules/ordering/domain";
import { isPrintedPlan, orderStatusLabel, orderStatusTone } from "@/modules/ordering/ui/status";
import {
  AUTHORING,
  AUTHORING_ASSISTANT,
  AUTHORING_ORDERING,
  AUTHORING_PHOTO_LIMIT,
  AUTHORING_PREVIEWS,
  type AuthoringAssistantPort,
  type AuthoringFacade,
  type AuthoringOrderBrief,
  type AuthoringOrderingPort,
  type AuthoringPreviewsPort,
  type PhotoLimitPort,
} from "./authoring.tokens";

function orderContextOf(order: AuthoringOrderBrief | null, locale: Locale): WebBookOrderContext {
  return {
    order: order ? { id: order.id, number: order.number, status: order.status, plan: order.plan } : null,
    paid: !!order && isPaid(order.status),
    label: order ? orderStatusLabel(order.status, locale, isPrintedPlan(order.plan)) : "",
    tone: order ? (orderStatusTone[order.status] ?? "neutral") : "neutral",
  };
}

/**
 * Запросы страниц и оболочки редактора книги (ADR 0012, section: "book"): читают данные через порты контекстов
 * без next/headers и собирают ответы едиными чистыми функциями authoring/ui/webBookPagesView.ts.
 */
@Injectable()
export class WebBookPagesQuery {
  constructor(
    @Inject(AUTHORING) private readonly authoring: AuthoringFacade,
    @Inject(AUTHORING_ORDERING) private readonly ordering: AuthoringOrderingPort,
    @Inject(AUTHORING_PREVIEWS) private readonly previews: AuthoringPreviewsPort,
    @Inject(AUTHORING_ASSISTANT) private readonly assistant: AuthoringAssistantPort,
    @Inject(AUTHORING_PHOTO_LIMIT) private readonly photoLimit: PhotoLimitPort,
  ) {}

  async nav(book: BookRow, locale: Locale): Promise<WebBookNavResponseDto> {
    const [userBooks, letters, order] = await Promise.all([
      this.authoring.queries.userBooks(book.userId),
      this.authoring.queries.letters(book.id),
      this.ordering.lastOrderOfBook(book.id),
    ]);
    return buildWebBookShellNav({ book, locale, userBooks, letters, orderCtx: orderContextOf(order, locale) });
  }

  async hub(book: BookRow, locale: Locale, m: Messages): Promise<WebBookHubDto> {
    const q = this.authoring.queries;
    const [stats, questions, ownChapters, photos, order, letters, built] = await Promise.all([
      q.stats(book),
      q.questions(book.id),
      q.chapters(book.id),
      q.photos(book.id),
      this.ordering.lastOrderOfBook(book.id),
      q.letters(book.id),
      this.previews.current(book.id).catch(() => null),
    ]);
    const rawAgreement = book.status === "draft" ? await this.ordering.agreementFor(book.userId) : null;
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
      orderCtx: orderContextOf(order, locale),
    });
  }

  async questionsPage(book: BookRow, viewer: BookViewer): Promise<WebBookQuestionsPageDto> {
    const q = this.authoring.queries;
    const [questions, chapters, photos, letters, proofreadAi, writerAi, maxPhotos] = await Promise.all([
      q.questions(book.id),
      q.chapters(book.id),
      q.photos(book.id),
      q.approvedLetters(book.id),
      book.status === "draft" ? this.assistant.proofreadConfigured() : false,
      book.status === "draft" ? this.assistant.writerConfigured() : false,
      this.photoLimit.maxPhotos(),
    ]);
    return buildWebBookQuestionsPageDto({ book, viewer, questions, chapters, photos, letters, proofreadAi, writerAi, maxPhotos });
  }

  async photosTab(book: BookRow, editable: boolean, m: Messages) {
    const q = this.authoring.queries;
    const [photos, questions, chapters, letters, editedPhotoIds, maxPhotos] = await Promise.all([
      q.photos(book.id),
      q.questions(book.id),
      q.chapters(book.id),
      q.approvedLetters(book.id),
      q.editedPhotoIds(book.id),
      this.photoLimit.maxPhotos(),
    ]);
    const dto = buildWebBookPhotosPageDto({ book, editable, m, photos, questions, chapters, letters, editedPhotoIds, maxPhotos });
    return { dto, places: entriesToPlacePairs(dto.places) };
  }

  async photosPage(book: BookRow, viewer: BookViewer, m: Messages): Promise<WebBookPhotosPageDto> {
    const editable = book.status === "draft" && isBookEditableBy(book.userId, viewer);
    return (await this.photosTab(book, editable, m)).dto;
  }

  async lettersPage(bookId: string): Promise<WebBookLettersPageDto> {
    return buildWebBookLettersPageDto(await this.authoring.queries.letters(bookId));
  }

  async coverPage(book: BookRow, locale: Locale, m: Messages): Promise<WebBookCoverPageDto> {
    const q = this.authoring.queries;
    const [photos, questions, chapters, stats, built] = await Promise.all([
      q.photos(book.id),
      q.questions(book.id),
      q.chapters(book.id),
      q.stats(book),
      this.previews.current(book.id).catch(() => null),
    ]);
    return buildWebBookCoverPageDto({ book, locale, m, photos, questions, chapters, stats, built });
  }

  async pagesPage(book: BookRow, viewer: BookViewer, m: Messages): Promise<WebBookPagesPageDto> {
    const q = this.authoring.queries;
    const [questions, chapters, photos, letters, screen, maxPhotos] = await Promise.all([
      q.questions(book.id),
      q.chapters(book.id),
      q.photos(book.id),
      q.approvedLetters(book.id),
      this.previews.current(book.id).catch(() => null),
      this.photoLimit.maxPhotos(),
    ]);
    return buildWebBookPagesPageDto({ book, viewer, m, questions, chapters, photos, letters, screen, maxPhotos });
  }

  async previewPage(book: BookRow, viewer: BookViewer): Promise<WebBookPreviewPageDto> {
    const q = this.authoring.queries;
    const [questions, bundle] = await Promise.all([q.questions(book.id), q.bundle(book.id)]);
    return buildWebBookPreviewPageDto({ book, viewer, questions, bundle });
  }
}
