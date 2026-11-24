import "server-only";
import { container } from "@/server/container";
import { messagesFor, type Messages } from "@/i18n/messages";
import { bookKind } from "@/lib/content/kinds";
import { buildBookContent } from "@/lib/book/book-content";
import { withCoverPhotos } from "@/lib/book/cover-photos";
import { editorModel } from "@/lib/book/editor-data";
import { questionTexts, toPhotoItem } from "@/lib/book/layout";
import { photoLosses } from "@/lib/book/photo-loss";
import { photoPlaceOf } from "@/lib/book/photo-place";
import { tocKey } from "@/lib/book/toc";
import { photoVersion } from "@/lib/photo-edit/doc";
import type { PlaceChapter } from "@/components/editor/photos/model";
import { maxPhotos } from "@/server/photoLimit";
import type { getAccessibleBook } from "@/server/books";
import type { PhotosTabData } from "./photos-tab";

type Book = Awaited<ReturnType<typeof getAccessibleBook>>;

/**
 * Данные вкладки «Фото» — одна сборка для страницы сайта и приложения (API v1 cabinetPhotos): места фото по той же
 * сборке, что PDF (обложка, письма близких), обрезка на месте, главы и ответы для листа «Где стоит фото».
 */
export async function photosTabData(book: Book, editable: boolean, m: Messages): Promise<PhotosTabData> {
  const q = container().authoring.queries;
  const [photos, questions, chapters, letters, edited] = await Promise.all([q.photos(book.id), q.questions(book.id), q.chapters(book.id), q.approvedLetters(book.id), q.editedPhotoIds(book.id)]);
  // Та же сборка, что у PDF: снимки обложки — видные на ней (cover-photos.ts), письма близких — последней главой.
  const covered = withCoverPhotos(book, photos.map((p) => p.id));
  const content = buildBookContent(covered, questions, photos.map(toPhotoItem), chapters, undefined, letters);
  const places = photoPlaceOf(content, photos, covered);
  const losses = photoLosses(content);

  // Главы для листов мест: в порядке редактора (и пустые — туда можно поставить фото заранее), названия — как в книге.
  const printed = new Map<string, { title: string; number: number | null; epigraph?: string }>(content.chapters.flatMap((c) => [[c.key, { title: c.title, number: c.number, epigraph: c.epigraph }] as const, ...(c.folded ?? []).map((f) => [f.key, { title: f.title, number: null }] as const)]));
  const untitled = messagesFor(book.language).book.untitledChapter;
  const ownTitle = (key: string) => book.tocLines?.[tocKey.chapter(key)]?.title?.trim();
  const model = editorModel(book, questions, chapters, photos);
  const placeChapters: PlaceChapter[] = model.chapters.map((c) => {
    const p = printed.get(c.key);
    return { key: c.key, title: p?.title || ownTitle(c.key) || c.title || untitled, number: p?.number ?? null, epigraph: p?.epigraph ?? c.epigraph, printed: !!p };
  });
  // Главы, которых нет у редактора («Разное», письма близких), — в конце, как в книге.
  for (const [key, p] of printed) if (!placeChapters.some((c) => c.key === key)) placeChapters.push({ key, title: p.title, number: p.number, epigraph: p.epigraph, printed: true });

  return {
    book: {
      id: book.id,
      interior: book.interior,
      format: book.format,
      language: book.language,
      blank: bookKind(book.theme) === "blank",
      photoPlacement: book.photoPlacement,
      galleryTitle: content.galleryTitle,
      // Править можно черновик, и сотруднику — только с правом правки (как в редакторе).
      editable,
      // Правила раскладки фото: на прежних первая правка места сначала переводит книгу (листы, ensureLayoutRev2).
      layoutRev: book.layoutRev,
    },
    photos: photos.map((p) => ({ id: p.id, width: p.width, height: p.height, caption: p.caption, layout: p.layout, questionId: p.questionId, chapter: p.chapter ?? null, opener: p.opener ?? false, crop: p.crop ?? null, version: photoVersion(p.storageKey), edited: edited.has(p.id) })),
    places: [...places],
    chapters: placeChapters,
    // Заголовок вопроса в книге: свой текст автора — без подстановки рода; пустой заголовок раздела — общая подпись.
    answers: questions.map((r) => ({ id: r.id, title: questionTexts(r, book).heading.trim() || m.books.photos.answer, chapterKey: r.chapter })),
    tocLines: book.tocLines ?? {},
    losses: Object.fromEntries(losses),
    maxPhotos: await maxPhotos(),
  };
}
