import type { Metadata } from "next";
import { requireUser } from "@/server/auth";
import { getAccessibleBook } from "@/server/books";
import { PhotosManager } from "./PhotosManager";
import { isPhotoFilter } from "./photos-tab";
import { loadPhotosPageData } from "./photos-data";
import { getLocale, getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).books.photos.meta };
}

export default async function PhotosPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ filter?: string | string[] }> }) {
  const { id } = await params;
  const { filter } = await searchParams;
  const user = await requireUser(`/books/${id}/photos`);
  const book = await getAccessibleBook(id, user);
  const [locale, m] = await Promise.all([getLocale(), getMessages()]);
  const data = await loadPhotosPageData(book, user, locale, m);
  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <PhotosManager data={data} initialFilter={isPhotoFilter(filter) ? filter : "all"} />
    </main>
  );
}
