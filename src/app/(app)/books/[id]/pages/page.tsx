import type { Metadata } from "next";
import { requireUser } from "@/server/auth";
import { getAccessibleBook } from "@/server/books";
import { container } from "@/server/container";
import { getLocale, getMessages } from "@/i18n/server";
import { coverName } from "@/i18n/labels";
import { getFormat } from "@/lib/book/formats";
import { bookInterior, getInteriorDesign, interiorsForCover, parseInteriorStyle } from "@/lib/book/interiors";
import { bookSpreadSample } from "@/server/spreadSample";
import { questionTexts, toPhotoItem } from "@/lib/book/layout";
import { buildBookContent } from "@/lib/book/book-content";
import { PagesEditor } from "./PagesEditor";

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
  // Фото по главам для блока «Главы книги»: что сейчас в каждой главе (с попавшими туда по правилу) и снимок начала.
  const built = buildBookContent(book, questions, photos.map(toPhotoItem), chapters);
  const openerKind = bookInterior(book).opener.photo;
  const photoPlan = {
    shape: !openerKind ? null : openerKind === "circle" ? ("circle" as const) : openerKind === "arch" ? ("arch" as const) : openerKind === "bleed" || openerKind === "full" ? ("page" as const) : ("square" as const),
    photos: photos.map((p) => ({ id: p.id, width: p.width, height: p.height, crop: p.crop ?? null, chapter: p.chapter ?? null, opener: p.opener ?? false, inAnswer: !!p.questionId })),
    byChapter: Object.fromEntries(
      built.chapters.flatMap((c) => {
        const entry = { ids: [...(c.openerPhoto ? [c.openerPhoto.id] : []), ...c.photos.map((p) => p.id)], opener: c.openerPhoto?.id ?? null };
        return [c.key, ...(c.folded ?? []).map((f) => f.key)].map((key) => [key, entry] as const);
      }),
    ),
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
        photoPlan={photoPlan}
        galleryTitle={built.galleryTitle}
        theme={book.theme}
        cover={{ name: coverName(book.coverTemplate, locale), pairs: interiorsForCover(book.coverTemplate).map((d) => d.id) }}
        initial={{ interior: getInteriorDesign(book.interior).id, interiorStyle: parseInteriorStyle(book.interiorStyle), dedication: book.dedication, showToc: book.showToc, tocMode: book.tocMode, tocLines: book.tocLines, photoPlacement: book.photoPlacement }}
      />
    </main>
  );
}
