import type { Metadata } from "next";
import { requireUser } from "@/server/auth";
import { getAccessibleBook, viewerOf } from "@/server/books";
import { isBookEditableBy } from "@/modules/authoring";
import { PhotosManager } from "./PhotosManager";
import { isPhotoFilter } from "./photos-tab";
import { photosTabData } from "./photos-data";
import { getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).books.photos.meta };
}

export default async function PhotosPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ filter?: string | string[] }> }) {
  const { id } = await params;
  const { filter } = await searchParams;
  const user = await requireUser(`/books/${id}/photos`);
  const book = await getAccessibleBook(id, user);
  const m = await getMessages();
  // Править можно черновик, и сотруднику — только с правом правки (как в редакторе).
  const editable = book.status === "draft" && isBookEditableBy(book.userId, await viewerOf(user, book.id));
  const data = await photosTabData(book, editable, m);
  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <PhotosManager data={data} initialFilter={isPhotoFilter(filter) ? filter : "all"} />
    </main>
  );
}
