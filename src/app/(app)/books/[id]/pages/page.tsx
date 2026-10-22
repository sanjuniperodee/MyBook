import type { Metadata } from "next";
import { requireUser } from "@/server/auth";
import { getAccessibleBook, viewerOf } from "@/server/books";
import { container } from "@/server/container";
import { isBookEditableBy } from "@/modules/authoring";
import { getLocale, getMessages } from "@/i18n/server";
import { messagesFor } from "@/i18n/messages";
import { coverName } from "@/i18n/labels";
import { bookKind } from "@/lib/content/kinds";
import { getFormat } from "@/lib/book/formats";
import { getInteriorDesign, interiorsForCover, parseInteriorStyle } from "@/lib/book/interiors";
import { bookSpreadSample } from "@/server/spreadSample";
import { questionTexts, toPhotoItem } from "@/lib/book/layout";
import { buildBookContent } from "@/lib/book/book-content";
import { withCoverPhotos } from "@/lib/book/cover-photos";
import { editorModel } from "@/lib/book/editor-data";
import { SUGGEST_TOP, suggestOpener } from "@/lib/book/opener-suggest";
import { openerFrame } from "@/lib/book/photo-pages";
import { photoPlaceOf } from "@/lib/book/photo-place";
import { tocKey } from "@/lib/book/toc";
import { photoChapters, type PlaceChapter } from "@/components/editor/photos/model";
import { PagesEditor } from "./PagesEditor";
import type { PagesPhotoData } from "./pages-photos";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).books.pages.meta };
}

export default async function PagesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/books/${id}/pages`);
  const book = await getAccessibleBook(id, user);
  const [questions, chapters, photos, m, locale, screen] = await Promise.all([
    container().authoring.queries.questions(book.id),
    container().authoring.queries.chapters(book.id),
    container().authoring.queries.photos(book.id),
    getMessages(),
    getLocale(),
    // Готовый макет книги — номера страниц оглавления на развороте те же, что в PDF; нет — оценка.
    container().previews.current(book.id).catch(() => null),
  ]);
  const t = m.books.pages;
  const format = getFormat(book.format);

  const spreadSample = bookSpreadSample(book, questions, chapters, t.dedicationEmpty, photos, screen?.chapterPages);
  // Фото глав и альбом — та же сборка, что у PDF и вкладки «Фото»: места фото (photoPlaceOf), снимки обложки — видные на ней.
  const covered = withCoverPhotos(book, photos.map((p) => p.id));
  const built = buildBookContent(covered, questions, photos.map(toPhotoItem), chapters);
  const places = photoPlaceOf(built, photos, covered);
  // Главы для листов: в порядке редактора (и пустые — туда фото ставят заранее), названия — как в книге.
  const printed = new Map<string, { title: string; number: number | null; epigraph?: string }>(built.chapters.flatMap((c) => [[c.key, { title: c.title, number: c.number, epigraph: c.epigraph }] as const, ...(c.folded ?? []).map((f) => [f.key, { title: f.title, number: null }] as const)]));
  const untitled = messagesFor(book.language).book.untitledChapter;
  const ownTitle = (key: string) => book.tocLines?.[tocKey.chapter(key)]?.title?.trim();
  const placeChapters: PlaceChapter[] = editorModel(book, questions, chapters, photos).chapters.map((c) => {
    const p = printed.get(c.key);
    return { key: c.key, title: p?.title || ownTitle(c.key) || c.title || untitled, number: p?.number ?? null, epigraph: p?.epigraph ?? c.epigraph, printed: !!p };
  });
  for (const [key, p] of printed) if (!placeChapters.some((c) => c.key === key)) placeChapters.push({ key, title: p.title, number: p.number, epigraph: p.epigraph, printed: true });
  // «Подходит по форме» — для рамки оформления, по которому собрана книга (сменят оформление — страница пересоберётся).
  const frame = openerFrame(format, getInteriorDesign(book.interior));
  const fit = frame ? Object.fromEntries(photoChapters(placeChapters.filter((c) => c.printed)).map((c) => [c.key, suggestOpener(built, photos, frame, c.key, covered).slice(0, SUGGEST_TOP).map((x) => x.id)])) : {};
  const photoData: PagesPhotoData = {
    book: {
      id: book.id,
      // Как у выбора оформления (initial.interior): прежние id оформлений — нынешние.
      interior: getInteriorDesign(book.interior).id,
      format: book.format,
      language: book.language,
      blank: bookKind(book.theme) === "blank",
      photoPlacement: book.photoPlacement,
      galleryTitle: built.galleryTitle,
      // Места фото правит черновик, и сотрудник — только с правом правки (как во вкладке «Фото»).
      editable: book.status === "draft" && isBookEditableBy(book.userId, await viewerOf(user, book.id)),
      // Правила раскладки фото: на прежних первая правка места сначала переводит книгу (листы, ensureLayoutRev2).
      layoutRev: book.layoutRev,
    },
    photos: photos.map((p) => ({ id: p.id, width: p.width, height: p.height, caption: p.caption, layout: p.layout, questionId: p.questionId, chapter: p.chapter ?? null, opener: p.opener ?? false, crop: p.crop ?? null })),
    places: [...places],
    chapters: placeChapters,
    answers: questions.map((r) => ({ id: r.id, title: questionTexts(r, book).heading.trim() || m.books.photos.answer, chapterKey: r.chapter })),
    fit,
  };
  // Истории для блока «Главы книги»: заголовок по умолчанию (с подставленным родом), свой и скрыт ли он.
  const stories = Object.fromEntries(questions.map((q) => [q.id, { title: questionTexts(q, book).title, displayText: q.displayText, hidden: q.hideHeading, pageBreak: q.pageBreak }]));

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="mb-5 font-serif text-3xl font-medium sm:mb-8 sm:text-5xl">{t.title}</h1>
      <PagesEditor
        bookId={book.id}
        format={format.id}
        editable={book.status === "draft"}
        sample={spreadSample}
        exactPages={screen?.chapterPages ?? null}
        stories={stories}
        photos={photoData}
        theme={book.theme}
        cover={{ name: coverName(book.coverTemplate, locale), pairs: interiorsForCover(book.coverTemplate).map((d) => d.id) }}
        initial={{ interior: getInteriorDesign(book.interior).id, interiorStyle: parseInteriorStyle(book.interiorStyle), dedication: book.dedication, showToc: book.showToc, tocMode: book.tocMode, tocLines: book.tocLines, photoPlacement: book.photoPlacement }}
      />
    </main>
  );
}
