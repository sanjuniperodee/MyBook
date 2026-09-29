import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getAccessibleBook, getBookPhotos } from "@/lib/books";
import { getTheme } from "@/lib/content/themes";
import { BackLink } from "@/components/BackLink";
import { CoverEditor } from "./CoverEditor";

export const metadata: Metadata = { title: "Обложка" };

export default async function CoverPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/books/${id}/cover`);
  const book = await getAccessibleBook(id, user);
  const photos = await getBookPhotos(book.id);
  const theme = getTheme(book.theme);
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <BackLink href={`/books/${book.id}`} />
      <h1 className="mt-6 mb-10 text-center font-serif text-4xl font-medium sm:text-5xl">Обложка книги</h1>
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
