import type { MediaPack } from "@/config/site";
import type { Locale } from "@/i18n/config";
import type { FileQuota, MediaPackOffer } from "@/lib/book/answer-files";
import type { ChapterStart } from "@/lib/book/chapter-head";
import type { SampleTocCandidate, TocLines } from "@/lib/book/toc";
import type { BookRow, BookViewer, QuestionRow } from "@/modules/authoring";
import type {
  AnswerFileRecord,
  KaspiInvoiceLike,
  MediaPurchaseLike,
} from "@/modules/authoring/ui/answer-media-view";
import type { StudioChapter } from "@/modules/authoring/ui/pages-studio";
import type { PagesAiMode, PagesAiPatchRaw, PagesSampleMeta } from "@/modules/authoring/ui/pages-view";
import type { AnswerFileRow, AnswerMedia } from "@/shared/infrastructure/db/schema";

export const PAGES_PORTS = Symbol("PagesPorts");
export const ANSWER_FILES_PORTS = Symbol("AnswerFilesPorts");

/** Настройки книги, которые меняют маршруты раздела «Страницы» и «Глав книги». */
export interface PagesSettingsPatch {
  interior?: string;
  interiorStyle?: Record<string, unknown>;
  dedication?: string;
  showToc?: boolean;
  endText?: string | null;
  titlePage?: boolean;
  openersLeft?: boolean;
  chapterStart?: ChapterStart;
  tocLines?: TocLines;
  tocMode?: "chapters" | "sections" | "both";
}

/** Данные об остатке запросов и наличии фото для панели ИИ-дизайнера страниц. */
export interface PagesAiInfoData {
  allowance: { remaining: number; limit: number; credits: number };
  hasPhotos: boolean;
}

/** Вход запроса к ИИ-дизайнеру страниц. */
export interface PagesAiRunInput {
  mode: PagesAiMode;
  prompt: string;
  history: { prompt: string; reply: string }[];
  state: { interior: string; style: Record<string, unknown> };
  chapters: { key: string; title: string }[];
}

/** Результат ответа ИИ-дизайнера страниц (правка, создание, варианты, оценка). */
export interface PagesAiRunResult {
  reply?: string;
  concept?: string | null;
  changed?: boolean;
  patch?: PagesAiPatchRaw;
  variants?: { name: string; idea: string; patch: PagesAiPatchRaw }[];
  score?: number;
  summary?: string;
  strengths?: string[];
  tips?: { title: string; why: string; patch: PagesAiPatchRaw | null }[];
}

/** Порты раздела «Страницы» и студии полос (8 маршрутов API v1). */
export interface PagesPorts {
  book(bookId: string): Promise<BookRow | null>;
  sampleMeta(bookId: string): Promise<PagesSampleMeta | null>;
  studioChapters(bookId: string): Promise<StudioChapter[]>;
  chapterCandidates(book: BookRow): Promise<SampleTocCandidate[]>;
  updateSettings(bookId: string, viewer: BookViewer, patch: PagesSettingsPatch): Promise<void>;
  moveChapter(bookId: string, viewer: BookViewer, input: { key: string; beforeKey?: string; afterKey?: string }): Promise<void>;
  aiInfo(userId: string, book: BookRow): Promise<PagesAiInfoData>;
  runAi(user: { id: string }, book: BookRow, input: PagesAiRunInput, locale: Locale): Promise<PagesAiRunResult>;
  storePreview(bookId: string, override: { interior: string; style: Record<string, unknown> }): Promise<string>;
}

/** Покупка пакета минут вместе с полями проверки владения. */
export interface OwnedMediaPurchase extends MediaPurchaseLike {
  bookId: string;
  userId: string;
}

/** Порты QR-медиа, загрузки своих видео/аудио и покупки пакетов минут (11 маршрутов API v1). */
export interface AnswerFilesPorts {
  questions(bookId: string): Promise<QuestionRow[]>;
  editQuestionMedia(bookId: string, viewer: BookViewer, questionId: string, media: AnswerMedia[]): Promise<void>;
  bookFileQuota(bookId: string): Promise<FileQuota>;
  listBookFiles(bookId: string): Promise<AnswerFileRecord[]>;
  findBookFile(bookId: string, fileId: string): Promise<AnswerFileRow | null>;
  mediaPackOffers(): Promise<MediaPackOffer[]>;
  kaspiAvailable(): Promise<boolean>;
  startUpload(input: {
    bookId: string;
    userId: string;
    name: string;
    size: number;
    mime: string;
    declaredSec: number | null;
  }): Promise<AnswerFileRecord>;
  appendChunk(file: AnswerFileRow, offset: number, bytes: Buffer): Promise<number>;
  finishUpload(file: AnswerFileRow): Promise<AnswerFileRecord>;
  kickWorker(): void;
  removeFile(file: AnswerFileRow): Promise<void>;
  ensureCatalog(): Promise<void>;
  createMediaPurchase(userId: string, bookId: string, pack: MediaPack): Promise<MediaPurchaseLike>;
  findMediaPurchase(purchaseId: string): Promise<OwnedMediaPurchase | null>;
  kaspiPaymentProps(purchaseId: string, defaultPhone: string): Promise<{ defaultPhone: string; initial: KaspiInvoiceLike | null } | null>;
  payMediaPack(purchaseId: string, userId: string, input: { method: "invoice" | "qr"; phone?: string | null }): Promise<KaspiInvoiceLike>;
  kaspiStatus(invoiceId: string, userId: string): Promise<KaspiInvoiceLike>;
}
