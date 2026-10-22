import "server-only";
import type { FlipbookData } from "./pages";
import { site } from "@/config/site";
import { buildBookContent } from "@/lib/book/book-content";
import { backContent, backPhotoIds } from "@/lib/book/cover-back";
import { coverNames } from "@/lib/book/cover-names";
import { coverPhotoIds } from "@/lib/book/covers";
import { estimatePages, estimateTocPages, sectionShares, textMetrics, tocParts } from "@/lib/book/estimate";
import { bookToc, GALLERY_KEY, hasToc, tocKey } from "@/lib/book/toc";
import { printablePageCount } from "@/lib/book/formats";
import { splitParagraphs } from "@/lib/book/inline-photo";
import { chapterRuns, photoPages, toPhotoItem, type ContentItem, type PhotoItem } from "@/lib/book/layout";
import { backPhotoRefs, coverPhotoRefs } from "@/lib/book/photo-refs";
import { photoUrl } from "@/lib/urls";
import type { Book, Photo } from "@/shared/infrastructure/db/schema";

type ContentArgs = Parameters<typeof buildBookContent>;

/**
 * Данные листаемой 3D-книги — из того же BookContent, что и PDF: название, имена на обложке, заголовок галереи и строка
 * «записано со слов» берутся оттуда, поэтому 3D и PDF не расходятся. Общее для страницы предпросмотра и стенда html-snapshot.
 */
export function flipbookData(book: Book, questions: ContentArgs[1], chapters: ContentArgs[3], allPhotos: Photo[], letters: ContentArgs[5] = []): FlipbookData {
  const content = buildBookContent(book, questions, allPhotos.map(toPhotoItem), chapters, undefined, letters);
  const backPhotos = backPhotoIds(book).flatMap((id) => allPhotos.filter((p) => p.id === id));
  const names = coverNames(book);
  const photos = coverPhotoRefs(coverPhotoIds(book), allPhotos, book, "view");
  const pagePhoto = (p: PhotoItem) => ({ id: p.id, url: photoUrl(p.id, "view"), width: p.width, height: p.height, caption: p.caption, layout: p.layout, ...(p.crop ? { crop: p.crop } : {}), ...(p.inline?.pageFit === "contain" ? { contain: true } : {}) });
  const entryOf = (it: ContentItem) => {
    const paragraphs = splitParagraphs(it.answer);
    const inline = (it.photos ?? []).map((p) => ({ id: p.id, url: photoUrl(p.id, "view"), width: p.width, height: p.height, caption: p.caption, inline: p.inline }));
    if (!paragraphs.length && !inline.length && !it.media?.length) return [];
    return [{ heading: it.heading, paragraphs, photos: inline, media: it.media, ...(it.pageBreak ? { pageBreak: true } : {}), ...(it.continued ? { continued: true } : {}) }];
  };
  return {
    // Название — как в PDF (с названием по умолчанию, если поле пустое), а не сырое поле книги.
    cover: { template: book.coverTemplate, format: book.format, title: content.title, subtitle: book.subtitle, names, photos },
    language: content.language,
    formatId: content.format.id,
    interiorId: content.interior.id,
    title: content.title,
    subtitle: content.subtitle,
    author: content.authorName,
    recordedBy: content.recordedBy,
    year: content.year,
    dedication: content.dedication,
    showToc: content.showToc,
    toc: flipbookToc(content),
    model: {
      pageCount: printablePageCount(estimatePages(content)),
      brand: site.name.toUpperCase(),
      back: backContent(book, backPhotos.map((p) => ({ width: p.width, height: p.height })), new Date()),
      backPhotos: backPhotoRefs(backPhotos, book, "view"),
    },
    chapters: content.chapters.map((c) => ({
      number: c.number,
      title: c.title,
      epigraph: c.epigraph,
      openerPhoto: c.openerPhoto ? photoUrl(c.openerPhoto.id, "view") : undefined,
      ...(c.openerPhoto?.crop ? { openerCrop: c.openerPhoto.crop } : {}),
      entries: c.items.flatMap(entryOf),
      // Фото на всю страницу в историях — глава кусками: текст, страница фото, продолжение (как в PDF).
      ...(c.items.some((it) => it.photoBefore) ? { runs: chapterRuns(c.items).map((r) => ({ entries: r.items.flatMap(entryOf), ...(r.photo ? { photo: pagePhoto(r.photo) } : {}) })) } : {}),
      photoPages: photoPages(c.photos).map((group) => group.map(pagePhoto)),
    })),
    gallery: content.galleryPhotos.length ? { title: content.galleryTitle, pages: photoPages(content.galleryPhotos).map((group) => group.map(pagePhoto)) } : undefined,
  };
}

/**
 * Оглавление 3D-книги по настройкам автора: строки, разложенные по полосам, и где каждая начинается — глава
 * (индекс в chapters, −1 — галерея) и доля текста главы перед разделом. Номер полосы считает клиент по своему замеру.
 * Оглавление по главам без своих строк — без этих данных: строки и номера даёт сама раскладка (как раньше).
 */
function flipbookToc(content: ReturnType<typeof buildBookContent>): FlipbookData["toc"] {
  if (!hasToc(content) || (!content.tocMode && !content.tocLines)) return undefined;
  const m = textMetrics(content.format, content.interior);
  const parts = tocParts(content, m);
  const where = new Map<string, { chapter: number; share: number | null }>();
  content.chapters.forEach((c, chapter) => {
    where.set(c.key, { chapter, share: null });
    const shares = sectionShares(c, m);
    c.items.forEach((it, i) => where.set(tocKey.section(it.id), { chapter, share: shares[i] }));
  });
  where.set(GALLERY_KEY, { chapter: -1, share: null });
  return {
    pages: estimateTocPages(content, m),
    lines: bookToc(content).map((l, i) => ({ key: l.key, title: l.label, number: l.number, level: l.level, part: parts[i] ?? 0, ...(where.get(l.pageKey) ?? { chapter: -1, share: null }) })),
  };
}
