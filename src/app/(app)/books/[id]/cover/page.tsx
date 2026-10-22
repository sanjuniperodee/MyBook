import { DEFAULT_BACK_LAYOUT, isBackLayout } from "@/lib/book/cover-back";
import type { Metadata } from "next";
import { requireUser } from "@/server/auth";
import { getAccessibleBook } from "@/server/books";
import { container } from "@/server/container";
import { getTheme } from "@/lib/content/themes";
import { parseFrames } from "@/lib/book/photo-frame";
import { parseCoverDesign } from "@/lib/book/cover-design";
import { bookSpreadSample } from "@/server/spreadSample";
import { bookKind } from "@/lib/content/kinds";
import { buildBookContent } from "@/lib/book/book-content";
import { withCoverPhotos } from "@/lib/book/cover-photos";
import { questionTexts, toPhotoItem } from "@/lib/book/layout";
import { photoPlaceOf } from "@/lib/book/photo-place";
import { editorModel } from "@/lib/book/editor-data";
import { CoverEditor } from "./CoverEditor";
import { getLocale, getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).books.cover.meta };
}

export default async function CoverPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/books/${id}/cover`);
  const book = await getAccessibleBook(id, user);
  const [photos, questions, chapters, locale, m] = await Promise.all([
    container().authoring.queries.photos(book.id),
    container().authoring.queries.questions(book.id),
    container().authoring.queries.chapters(book.id),
    getLocale(),
    getMessages(),
  ]);
  const theme = getTheme(book.theme, locale);
  // Где каждое фото в книге — та же сборка, что у PDF и вкладки «Фото»: подписи в выборе фото обложки.
  const covered = withCoverPhotos(book, photos.map((p) => p.id));
  const content = buildBookContent(covered, questions, photos.map(toPhotoItem), chapters);
  const places = photoPlaceOf(content, photos, covered);
  const placeNames = {
    // Главы книги — названия как в печати (идут последними: у подписей побеждает последнее); без текста — как в редакторе.
    chapters: [
      ...editorModel(book, questions, chapters, photos).chapters.map((c) => ({ key: c.key, title: c.title })),
      ...content.chapters.flatMap((c) => [{ key: c.key, title: c.title }, ...(c.folded ?? []).map((f) => ({ key: f.key, title: f.title }))]),
    ],
    answers: questions.map((q) => ({ id: q.id, title: questionTexts(q, book).heading.trim() || m.books.photos.answer })),
  };
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="mb-5 font-serif text-3xl font-medium sm:mb-8 sm:text-5xl">{m.books.cover.title}</h1>
      <CoverEditor
        bookId={book.id}
        format={book.format}
        editable={book.status === "draft"}
        recipientLabel={theme.recipientLabel ?? ""}
        sample={bookSpreadSample(book, questions, chapters, m.books.pages.dedicationEmpty, photos)}
        photos={photos.map((p) => ({ id: p.id, width: p.width, height: p.height, opener: p.opener ?? false }))}
        places={[...places]}
        placeNames={placeNames}
        blank={bookKind(book.theme) === "blank"}
        theme={book.theme}
        year={book.occasionDate ? Number(book.occasionDate.slice(0, 4)) : new Date().getFullYear()}
        initial={{
          coverTemplate: book.coverTemplate,
          title: book.title,
          subtitle: book.subtitle,
          authorName: book.authorName,
          recordedBy: book.recordedBy,
          recipientName: book.recipientName,
          hideRecipientOnCover: book.hideRecipientOnCover,
          namesOnCover: book.namesOnCover,
          backText: book.backText,
          backLayout: isBackLayout(book.backLayout) ? book.backLayout : DEFAULT_BACK_LAYOUT,
          backPhotoId: book.backPhotoId,
          backPhotoExtra: book.backPhotoExtra,
          coverPhotoId: book.coverPhotoId,
          coverPhotoExtra: book.coverPhotoExtra,
          photoFrames: parseFrames(book.photoFrames),
          interior: book.interior,
          coverDesign: parseCoverDesign(book.coverDesign),
        }}
      />
    </main>
  );
}
