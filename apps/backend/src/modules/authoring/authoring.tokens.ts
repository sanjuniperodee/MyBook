import type { Locale } from "@/i18n/config";
import type { BookBuild, BookBuildState, BuildProgress } from "@/lib/book/book-build";
import type { Levels, PhotoEdit } from "@/lib/photo-edit/doc";
import type { AuthoringModule as AuthoringContext } from "@/modules/authoring";
import type { RawDealAgreement } from "@/modules/authoring/ui/webBookPagesView";
import type { OrderStatus } from "@/shared/domain/orders";

/** Фасад контекста Authoring (src/modules/authoring): книги, вопросы, фото, письма и read-модели. */
export const AUTHORING = Symbol("Authoring");
export type AuthoringFacade = AuthoringContext;

/** Принадлежность книги менеджеру клиента (контекст Reporting) — для роли CRM «только свои» в BookAccessGuard. */
export const AUTHORING_BOOK_OWNERSHIP = Symbol("AuthoringBookOwnership");
export interface BookOwnershipPort {
  bookOwnership(bookId: string): Promise<{ managerId: string | null } | null>;
}

/** Сведения о заказах и договорённостях клиента (контекст Ordering) для списка книг, навигации и штаба книги. */
export const AUTHORING_ORDERING = Symbol("AuthoringOrdering");
export interface AuthoringOrderBrief {
  id: string;
  bookId: string;
  number: number;
  status: OrderStatus;
  plan: string;
}
export interface AuthoringOrderingPort {
  userOrders(userId: string): Promise<readonly AuthoringOrderBrief[]>;
  lastOrderOfBook(bookId: string): Promise<AuthoringOrderBrief | null>;
  agreementFor(userId: string): Promise<RawDealAgreement | null>;
}

/** Экранная сборка и её ход (контекст Production) для 3D-модели, страниц книги и предпросмотра. */
export const AUTHORING_PREVIEWS = Symbol("AuthoringPreviews");
export interface AuthoringPreviewsPort {
  current(bookId: string): Promise<BookBuild | null>;
  build(bookId: string, opts?: { retry?: boolean }): Promise<BookBuildState | null>;
  progressOf(bookId: string): BuildProgress | null;
}

/** AI-помощник (контекст Assistant): диктовка ответов и признаки доступности корректора/писателя в редакторе. */
export const AUTHORING_ASSISTANT = Symbol("AuthoringAssistant");
export interface AuthoringAssistantPort {
  dictate(input: { data: string; mime: string; language: Locale }): Promise<{ text: string; by: string } | { error: string }>;
  proofreadConfigured(): Promise<boolean>;
  writerConfigured(): Promise<boolean>;
}

/** Предел фото в одной книге (настройка сайта books.maxPhotos). */
export const AUTHORING_PHOTO_LIMIT = Symbol("AuthoringPhotoLimit");
export interface PhotoLimitPort {
  maxPhotos(): Promise<number>;
}

/** Серверный рендер и чтение размеров оригинала для редактора фото (sharp + applyColor). */
export const AUTHORING_PHOTO_RENDERER = Symbol("AuthoringPhotoRenderer");
export interface PhotoEditRendererPort {
  probeOriginal(origBytes: Buffer): Promise<{ width: number; height: number; suggestedLevels: Levels }>;
  renderEdit(origBytes: Buffer, doc: PhotoEdit): Promise<Buffer>;
}
