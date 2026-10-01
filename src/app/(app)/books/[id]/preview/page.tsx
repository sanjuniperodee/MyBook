import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { requireUser } from "@/server/auth";
import { getAccessibleBook } from "@/server/books";
import { CoverPreview } from "@/components/cover/CoverPreview";
import { coverNamesLine } from "@/lib/book/covers";
import { photoUrl } from "@/lib/urls";
import { PreviewFrame } from "./PreviewFrame";
import { getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).books.preview.meta };
}

export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/books/${id}/preview`);
  const book = await getAccessibleBook(id, user);
  const t = (await getMessages()).books.preview;
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-4xl font-medium sm:text-5xl">{t.title}</h1>
        {book.status === "draft" ? (
          <Link href={`/books/${book.id}/checkout`} className="btn btn-primary">
            {t.order}
          </Link>
        ) : null}
      </div>
      <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className="hidden lg:block">
          <div className="sticky top-24">
            <CoverPreview
              template={book.coverTemplate}
              format={book.format}
              title={book.title}
              subtitle={book.subtitle}
              names={coverNamesLine(book.authorName, book.recipientName, book.hideRecipientOnCover)}
              photoUrl={book.coverPhotoId ? photoUrl(book.coverPhotoId, "full") : undefined}
              className="rounded-[3px] shadow-book"
            />
            <Link href={`/books/${book.id}/cover`} className="mt-3 block text-center text-sm text-wine hover:underline">
              {t.changeCover}
            </Link>
          </div>
        </div>
        <PreviewFrame bookId={book.id} initialVersion={book.updatedAt.getTime()} />
      </div>
    </main>
  );
}
