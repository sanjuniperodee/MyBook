import type { AiPack, MediaPack } from "@/config/site";
import type { Locale } from "@/i18n/config";
import type { AnswerFileView, FileKind, FileQuota, MediaPackOffer } from "@/lib/book/answer-files";
import type { PageImageWidth } from "@/lib/book/book-build";
import type { CoverImageOptions, CoverImageWidth } from "@/lib/book/cover-image-version";
import type { DesignAiBody } from "@/lib/book/design-ai";
import type { BookKind } from "@/lib/content/kinds";
import type { RewriteMode } from "@/modules/assistant";
import type { BookRow, DesignAiPurchase } from "@/modules/authoring";
import type { HelpPlace } from "@/modules/messaging/domain/cabinetHelp";
import type { PaymentTarget } from "@/modules/ordering";
import type { KaspiInvoiceView } from "@/modules/ordering/ui/kaspi";
import type { PagesImageWidth, PagesSpread } from "@/modules/production";
import type { CLIENT_AI_TOOLS } from "@/shared/domain/aiTools";

export type SiteClientAiTool = (typeof CLIENT_AI_TOOLS)[number];

/** Растр одной полосы экранной сборки книги. */
export interface SitePageImage {
  data: Buffer;
  limited: boolean;
}

/** Строка своего видео/аудио к ответу (минимум полей, нужный контроллерам сайта). */
export interface SiteAnswerFileRow {
  id: string;
  token: string;
  bookId: string;
  userId: string | null;
  kind: FileKind;
  status: string;
  name: string;
  sourceMime: string;
  sourceBytes: number;
  receivedBytes: number;
  declaredSec: number | null;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  hasPoster: boolean;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Покупка пакета минут для своих файлов книги. */
export interface SiteMediaPurchase {
  id: string;
  number: number;
  minutes: number;
  amount: number;
}

/** Блок оплаты Kaspi для пакетов минут / пакетов ИИ-дизайнера. */
export interface SiteKaspiPaymentProps {
  initial: KaspiInvoiceView | null;
  defaultPhone: string;
}

/** Кэшированный фон обложки (SVG с br/gzip или растр JPEG/WebP). */
export interface SiteCoverArtEntry {
  type: string;
  raw: string | Buffer;
  br?: Buffer;
  gzip?: Buffer;
}

/** Параметры потоковой отдачи файла из хранилища (Range / If-None-Match / AbortSignal). */
export interface StorageStreamInput {
  range: string | null;
  ifNoneMatch: string | null;
  signal?: AbortSignal;
}

/** Результат oEmbed YouTube: ok=false при сетевом сбое (ответ без Cache-Control). */
export type YoutubeOembedResult = { ok: true; title: string | null } | { ok: false };

/** Порт смежных сервисов для 42 маршрутов сайта Authoring (без next/headers). */
export const AUTHORING_SITE_PORTS = Symbol("AuthoringSitePorts");

export interface AuthoringSitePorts {
  // ─── Свои видео и аудио книги (/api/books/{id}/files*, /api/v/{token}) ───
  bookFileQuota(bookId: string): Promise<FileQuota>;
  listBookFiles(bookId: string): Promise<SiteAnswerFileRow[]>;
  findBookFile(bookId: string, fileId: string): Promise<SiteAnswerFileRow | null>;
  findAnswerFileByToken(token: string): Promise<SiteAnswerFileRow | null>;
  fileView(file: SiteAnswerFileRow): AnswerFileView;
  mediaPackOffers(): Promise<MediaPackOffer[]>;
  startUpload(input: { bookId: string; userId: string; name: string; size: number; mime: string; declaredSec: number | null }): Promise<SiteAnswerFileRow>;
  appendChunk(file: SiteAnswerFileRow, offset: number, bytes: Buffer): Promise<number>;
  finishUpload(file: SiteAnswerFileRow): Promise<SiteAnswerFileRow>;
  removeFile(file: Pick<SiteAnswerFileRow, "id" | "bookId">): Promise<void>;
  kickAnswerFiles(): void;
  createMediaPurchase(userId: string, bookId: string, pack: MediaPack): Promise<SiteMediaPurchase>;
  serveAnswerPoster(file: SiteAnswerFileRow, req: StorageStreamInput, headers: Record<string, string>): Promise<Response | null>;
  serveAnswerMedia(file: SiteAnswerFileRow, req: StorageStreamInput, headers: Record<string, string>): Promise<Response | null>;

  // ─── Оплата пакетов и каталог (/files/packs, /design-ai/packs) ───
  ensureCatalog(): Promise<void>;
  kaspiAvailable(): Promise<boolean>;
  kaspiPaymentProps(target: PaymentTarget, defaultPhone: string): Promise<SiteKaspiPaymentProps | null>;
  createDesignAiPurchase(userId: string, pack: AiPack): Promise<DesignAiPurchase>;

  // ─── Экспорт, PDF-предпросмотр, растр полос, развороты и обложки ───
  manuscript(bookId: string): Promise<{ title: string; text: string } | null>;
  previewPdf(bookId: string): Promise<Buffer | null>;
  pageImage(bookId: string, fp: string, page: number, width: PageImageWidth, signal?: AbortSignal): Promise<SitePageImage | null>;
  pagesSpreadImage(bookId: string, kind: PagesSpread, width: PagesImageWidth, design?: string, preview?: string): Promise<{ image: Buffer; version: string } | null>;
  coverImage(book: BookRow, width: CoverImageWidth, options: CoverImageOptions): Promise<Buffer | null>;
  coverTemplateThumb(book: BookRow, template: string): Promise<Buffer | null>;

  // ─── Помощник по книге, ИИ-дизайнер, корректор, писатель, словарь ───
  helpThread(book: BookRow, userId: string): Promise<Record<string, unknown>>;
  helpAsk(
    book: BookRow,
    user: { id: string; name: string | null },
    input: { text: string; place: HelpPlace | null; human?: boolean },
    locale: Locale,
    opts?: { actions?: boolean },
  ): Promise<Record<string, unknown>>;
  helpApply(book: BookRow, user: { id: string }, input: { proposal: string; decline?: boolean }, locale: Locale): Promise<Record<string, unknown>>;
  designAiInfo(userId: string, book: BookRow): Promise<Record<string, unknown>>;
  runDesignAi(user: { id: string }, book: BookRow, input: DesignAiBody, locale: Locale): Promise<Record<string, unknown>>;
  hitClientAi(tool: SiteClientAiTool, userId: string): Promise<"ok" | "short" | "long">;
  proofreadConfigured(): Promise<boolean>;
  proofreadCheck(text: string, bookLanguage: Locale, uiLocale: Locale, opts: { kind: BookKind }): Promise<unknown[]>;
  writerConfigured(): Promise<boolean>;
  writerRewrite(text: string, mode: RewriteMode, bookLanguage: Locale, opts: { kind: BookKind; instruction?: string }): Promise<string>;
  misspelled(words: string[]): Promise<Record<string, string[]>>;

  // ─── Потоковые медиа, шрифты, обложки и oEmbed ───
  servePhotoFile(key: string, req: StorageStreamInput, headers: Record<string, string>): Promise<Response | null>;
  coverArt(file: string): Promise<SiteCoverArtEntry | null>;
  coverPhotoResized(key: string, width: number): Promise<Buffer>;
  readFontFile(file: string): Promise<Buffer | null>;
  fetchYoutubeTitle(videoId: string): Promise<YoutubeOembedResult>;
}
