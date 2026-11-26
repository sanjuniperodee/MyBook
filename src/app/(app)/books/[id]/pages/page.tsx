import type { Metadata } from "next";
import { requireUser } from "@/web/auth";
import { getAccessibleBook } from "@/web/books";
import { entriesToPlacePairs } from "@/web/dto";
import { v1WebRead } from "@/web/api";
import { getLocale, getMessages } from "@/i18n/server";
import { coverName } from "@/i18n/labels";
import { getFormat } from "@/lib/book/formats";
import { getInteriorDesign, interiorsForCover, parseInteriorStyle } from "@/lib/book/interiors";
import { PAGINATION_REV_2 } from "@/lib/book/layout";
import type { SpreadSample } from "@/components/interior/InteriorSpread";
import { PagesEditor } from "./PagesEditor";
import type { PagesPhotoData } from "./pages-photos";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).books.pages.meta };
}

export default async function PagesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/books/${id}/pages`);
  const book = await getAccessibleBook(id, user);
  const locale = await getLocale();
  const data = await v1WebRead({
    name: "book.pagesPage",
    section: "book",
    locale,
    viaApi: (api) => api.webBookPagesPage({ bookId: book.id, locale }),
  });
  const format = getFormat(book.format);
  const spreadSample: SpreadSample = {
    ...data.sample,
    toc: data.sample.toc.map(({ level, ...rest }) => ({
      ...rest,
      ...(level !== undefined ? { level: (level === 1 ? 1 : 0) as 0 | 1 } : {}),
    })),
  };
  const photoData: PagesPhotoData = {
    ...data.photos,
    places: entriesToPlacePairs(data.photos.places),
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-6">
      <PagesEditor
        bookId={book.id}
        format={format.id}
        editable={book.status === "draft"}
        sample={spreadSample}
        exactPages={data.exactPages}
        stories={data.stories}
        photos={photoData}
        theme={book.theme}
        cover={{ name: coverName(book.coverTemplate, locale), pairs: interiorsForCover(book.coverTemplate).map((d) => d.id) }}
        initial={{
          interior: getInteriorDesign(book.interior).id,
          interiorStyle: parseInteriorStyle(book.interiorStyle),
          dedication: book.dedication,
          showToc: book.showToc,
          tocMode: book.tocMode,
          tocLines: book.tocLines,
          photoPlacement: book.photoPlacement,
          openersLeft: book.paginationRev === PAGINATION_REV_2,
          chapterStart: book.chapterStart,
          endText: book.endText,
          titlePage: book.titlePage,
        }}
      />
    </main>
  );
}
