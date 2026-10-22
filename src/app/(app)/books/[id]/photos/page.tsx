import type { Metadata } from "next";
import { requireUser } from "@/server/auth";
import { getAccessibleBook, viewerOf } from "@/server/books";
import { isBookEditableBy } from "@/modules/authoring";
import { container } from "@/server/container";
import { messagesFor } from "@/i18n/messages";
import { bookKind } from "@/lib/content/kinds";
import { buildBookContent } from "@/lib/book/book-content";
import { withCoverPhotos } from "@/lib/book/cover-photos";
import { editorModel } from "@/lib/book/editor-data";
import { questionTexts, toPhotoItem } from "@/lib/book/layout";
import { photoLosses } from "@/lib/book/photo-loss";
import { photoPlaceOf } from "@/lib/book/photo-place";
import { tocKey } from "@/lib/book/toc";
import type { PlaceChapter } from "@/components/editor/photos/model";
import { PhotosManager } from "./PhotosManager";
import { isPhotoFilter, type PhotosTabData } from "./photos-tab";
import { getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).books.photos.meta };
}

export default async function PhotosPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ filter?: string | string[] }> }) {
  const { id } = await params;
  const { filter } = await searchParams;
  const user = await requireUser(`/books/${id}/photos`);
  const book = await getAccessibleBook(id, user);
  const q = container().authoring.queries;
  const [photos, questions, chapters, letters, m] = await Promise.all([q.photos(book.id), q.questions(book.id), q.chapters(book.id), q.approvedLetters(book.id), getMessages()]);
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

  const data: PhotosTabData = {
    book: {
      id: book.id,
      interior: book.interior,
      format: book.format,
      language: book.language,
      blank: bookKind(book.theme) === "blank",
      photoPlacement: book.photoPlacement,
      galleryTitle: content.galleryTitle,
      // Править можно черновик, и сотруднику — только с правом правки (как в редакторе).
      editable: book.status === "draft" && isBookEditableBy(book.userId, await viewerOf(user, book.id)),
    },
    photos: photos.map((p) => ({ id: p.id, width: p.width, height: p.height, caption: p.caption, layout: p.layout, questionId: p.questionId, chapter: p.chapter ?? null, opener: p.opener ?? false, crop: p.crop ?? null })),
    places: [...places],
    chapters: placeChapters,
    // Заголовок вопроса в книге: свой текст автора — без подстановки рода; пустой заголовок раздела — общая подпись.
    answers: questions.map((r) => ({ id: r.id, title: questionTexts(r, book).heading.trim() || m.books.photos.answer, chapterKey: r.chapter })),
    tocLines: book.tocLines ?? {},
    losses: Object.fromEntries(losses),
  };
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <PhotosManager data={data} initialFilter={isPhotoFilter(filter) ? filter : "all"} />
    </main>
  );
}
