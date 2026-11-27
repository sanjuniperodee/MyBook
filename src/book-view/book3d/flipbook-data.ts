import "server-only";
import type { CoverPreviewProps } from "@/book-view/cover/CoverPreview";
import type { BackContent } from "@/lib/book/cover-back";
import type { PhotoRef } from "@/lib/book/covers/svg-kit";
import { site } from "@/config/site";
import { buildBookContent } from "@/lib/book/book-content";
import { backContent, backPhotoIds } from "@/lib/book/cover-back";
import { coverNames, printedCoverTitle } from "@/lib/book/cover-names";
import { parseCoverDesign } from "@/lib/book/cover-design";
import { coverPhotoIds } from "@/lib/book/covers";
import { toPhotoItem } from "@/lib/book/layout";
import { backPhotoRefs, coverPhotoRefs } from "@/lib/book/photo-refs";
import type { Book, Photo } from "@/shared/infrastructure/db/schema";

type ContentArgs = Parameters<typeof buildBookContent>;


/**
 * Что 3D-книге нужно, кроме полос, одними сериализуемыми данными (страница-сервер → клиентский компонент):
 * обложка, оборот и формат. Полосы — картинки экранной сборки (тот же PDF, что для типографии), их 3D-книга веба
 * спрашивает сама; толщина корешка — по числу полос этой сборки.
 */
export interface FlipbookData {
  cover: Pick<CoverPreviewProps, "template" | "format" | "title" | "subtitle" | "names" | "photos" | "titlePlaceholder" | "photoHint" | "design" | "lines"> & {
    /** Оборот: свой фон и слои (books.cover_back, разбирает parseCoverBack). */
    back?: unknown;
  };
  formatId: string;
  /** Название книги, как в PDF: на корешке, если на обложке его нет. */
  title: string;
  model: { brand: string; back: BackContent; backPhotos?: (PhotoRef | undefined)[] };
}

/**
 * Переплёт листаемой 3D-книги — из того же BookContent, что и PDF: название (с названием по умолчанию, если поле
 * пустое) и имена на обложке не расходятся с печатью. Полосы книга берёт из экранной сборки, здесь их нет.
 */
export function flipbookData(book: Book, questions: ContentArgs[1], chapters: ContentArgs[3], allPhotos: Photo[], letters: ContentArgs[5] = []): FlipbookData {
  const content = buildBookContent(book, questions, allPhotos.map(toPhotoItem), chapters, undefined, letters);
  const backPhotos = backPhotoIds(book).flatMap((id) => allPhotos.filter((p) => p.id === id));
  const names = coverNames(book);
  const photos = coverPhotoRefs(coverPhotoIds(book), allPhotos, book, "view");
  // Название на лице и корешке — как в cover.pdf: обложка из конструктора со стёртым названием печатается без него.
  const title = printedCoverTitle(book, !!parseCoverDesign(book.coverDesign), content.title);
  return {
    cover: { template: book.coverTemplate, ...(book.coverLines === false ? { lines: false } : {}), format: book.format, title, subtitle: book.subtitle, names, photos, ...(book.coverDesign ? { design: book.coverDesign } : {}), ...(book.coverBack ? { back: book.coverBack } : {}) },
    formatId: content.format.id,
    title,
    model: {
      brand: site.name.toUpperCase(),
      back: backContent(book, backPhotos.map((p) => ({ width: p.width, height: p.height })), new Date()),
      backPhotos: backPhotoRefs(backPhotos, book, "view"),
    },
  };
}
