import "server-only";
import type { FlipbookData } from "./pages";
import { site } from "@/config/site";
import { buildBookContent } from "@/lib/book/book-content";
import { backContent, backPhotoIds } from "@/lib/book/cover-back";
import { coverNames } from "@/lib/book/cover-names";
import { coverPhotoIds } from "@/lib/book/covers";
import { toPhotoItem } from "@/lib/book/layout";
import { backPhotoRefs, coverPhotoRefs } from "@/lib/book/photo-refs";
import type { Book, Photo } from "@/shared/infrastructure/db/schema";

type ContentArgs = Parameters<typeof buildBookContent>;

/**
 * Переплёт листаемой 3D-книги — из того же BookContent, что и PDF: название (с названием по умолчанию, если поле
 * пустое) и имена на обложке не расходятся с печатью. Полосы книга берёт из экранной сборки, здесь их нет.
 */
export function flipbookData(book: Book, questions: ContentArgs[1], chapters: ContentArgs[3], allPhotos: Photo[], letters: ContentArgs[5] = []): FlipbookData {
  const content = buildBookContent(book, questions, allPhotos.map(toPhotoItem), chapters, undefined, letters);
  const backPhotos = backPhotoIds(book).flatMap((id) => allPhotos.filter((p) => p.id === id));
  const names = coverNames(book);
  const photos = coverPhotoRefs(coverPhotoIds(book), allPhotos, book, "view");
  return {
    cover: { template: book.coverTemplate, format: book.format, title: content.title, subtitle: book.subtitle, names, photos },
    formatId: content.format.id,
    title: content.title,
    model: {
      brand: site.name.toUpperCase(),
      back: backContent(book, backPhotos.map((p) => ({ width: p.width, height: p.height })), new Date()),
      backPhotos: backPhotoRefs(backPhotos, book, "view"),
    },
  };
}
