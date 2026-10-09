import { DEFAULT_BACK_LAYOUT, isBackLayout } from "@/lib/book/cover-back";
import type { Metadata } from "next";
import { requireUser } from "@/server/auth";
import { getAccessibleBook } from "@/server/books";
import { container } from "@/server/container";
import { getTheme } from "@/lib/content/themes";
import { bookSpreadSample } from "@/server/spreadSample";
import { CoverEditor } from "./CoverEditor";
import { getLocale, getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).books.cover.meta };
}

export default async function CoverPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/books/${id}/cover`);
  const book = await getAccessibleBook(id, user);
  const [photos, questions, locale, m] = await Promise.all([
    container().authoring.queries.photos(book.id),
    container().authoring.queries.questions(book.id),
    getLocale(),
    getMessages(),
  ]);
  const theme = getTheme(book.theme, locale);
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="mb-8 font-serif text-4xl font-medium sm:text-5xl">{m.books.cover.title}</h1>
      <CoverEditor
        bookId={book.id}
        format={book.format}
        editable={book.status === "draft"}
        recipientLabel={theme.recipientLabel}
        sample={bookSpreadSample(book, questions, m.books.pages.dedicationEmpty)}
        photos={photos.map((p) => ({ id: p.id, width: p.width, height: p.height }))}
        theme={book.theme}
        year={book.occasionDate ? Number(book.occasionDate.slice(0, 4)) : new Date().getFullYear()}
        initial={{
          coverTemplate: book.coverTemplate,
          title: book.title,
          subtitle: book.subtitle,
          authorName: book.authorName,
          recipientName: book.recipientName,
          hideRecipientOnCover: book.hideRecipientOnCover,
          backText: book.backText,
          backLayout: isBackLayout(book.backLayout) ? book.backLayout : DEFAULT_BACK_LAYOUT,
          backPhotoId: book.backPhotoId,
          coverPhotoId: book.coverPhotoId,
          interior: book.interior,
        }}
      />
    </main>
  );
}
