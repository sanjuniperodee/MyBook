import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getAccessibleBook, getBookPhotos } from "@/lib/books";
import { BackLink } from "@/components/BackLink";
import { PhotosManager } from "./PhotosManager";

export const metadata: Metadata = { title: "Фотографии" };

export default async function PhotosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/books/${id}/photos`);
  const book = await getAccessibleBook(id, user);
  const photos = await getBookPhotos(book.id);
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <BackLink href={`/books/${book.id}`} />
      <div className="mt-6">
        <PhotosManager
          bookId={book.id}
          format={book.format}
          editable={book.status === "draft"}
          initial={photos.map((p) => ({ id: p.id, caption: p.caption, layout: p.layout, width: p.width, height: p.height }))}
        />
      </div>
    </main>
  );
}
