import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getAccessibleBook, getBookPhotos } from "@/lib/books";
import { getTheme } from "@/lib/content/themes";
import { CoverEditor } from "./CoverEditor";
import { getLocale, getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).books.cover.meta };
}

export default async function CoverPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/books/${id}/cover`);
  const book = await getAccessibleBook(id, user);
  const photos = await getBookPhotos(book.id);
  const [locale, m] = await Promise.all([getLocale(), getMessages()]);
  const theme = getTheme(book.theme, locale);
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="mb-8 font-serif text-4xl font-medium sm:text-5xl">{m.books.cover.title}</h1>
      <CoverEditor
        bookId={book.id}
        format={book.format}
        editable={book.status === "draft"}
        recipientLabel={theme.recipientLabel}
        photos={photos.map((p) => ({ id: p.id, width: p.width, height: p.height }))}
        initial={{
          coverTemplate: book.coverTemplate,
          title: book.title,
          subtitle: book.subtitle,
          authorName: book.authorName,
          recipientName: book.recipientName,
          hideRecipientOnCover: book.hideRecipientOnCover,
          backText: book.backText,
          coverPhotoId: book.coverPhotoId,
        }}
      />
    </main>
  );
}
