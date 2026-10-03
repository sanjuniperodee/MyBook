import type { Metadata } from "next";
import { requireUser } from "@/server/auth";
import { getAccessibleBook } from "@/server/books";
import { container } from "@/server/container";
import { getLocale, getMessages } from "@/i18n/server";
import { coverName } from "@/i18n/labels";
import { getFormat } from "@/lib/book/formats";
import { getInteriorDesign, interiorsForCover } from "@/lib/book/interiors";
import { bookSpreadSample } from "@/server/spreadSample";
import { PagesEditor } from "./PagesEditor";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).books.pages.meta };
}

export default async function PagesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/books/${id}/pages`);
  const book = await getAccessibleBook(id, user);
  const [questions, m, locale] = await Promise.all([container().authoring.queries.questions(book.id), getMessages(), getLocale()]);
  const t = m.books.pages;
  const format = getFormat(book.format);

  const spreadSample = bookSpreadSample(book, questions, t.dedicationEmpty);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="mb-8 font-serif text-4xl font-medium sm:text-5xl">{t.title}</h1>
      <PagesEditor
        bookId={book.id}
        format={format.id}
        editable={book.status === "draft"}
        sample={spreadSample}
        cover={{ name: coverName(book.coverTemplate, locale), pairs: interiorsForCover(book.coverTemplate).map((d) => d.id) }}
        initial={{ interior: getInteriorDesign(book.interior).id, dedication: book.dedication, showToc: book.showToc, photoPlacement: book.photoPlacement }}
      />
    </main>
  );
}
