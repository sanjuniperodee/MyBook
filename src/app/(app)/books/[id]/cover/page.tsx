import { DEFAULT_BACK_LAYOUT, isBackLayout } from "@/lib/book/cover-back";
import type { Metadata } from "next";
import { requireUser } from "@/server/auth";
import { getAccessibleBook } from "@/server/books";
import { entriesToPlacePairs, localCoverPageDto } from "@/server/v1-local-bridge-book";
import { v1WebRead } from "@/server/v1-web-client";
import { parseFrames } from "@/lib/book/photo-frame";
import { parseCoverBack, parseCoverDesign } from "@/lib/book/cover-design";
import { bookKind } from "@/lib/content/kinds";
import type { SpreadSample } from "@/components/interior/InteriorSpread";
import { CoverEditor } from "./CoverEditor";
import { getLocale, getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).books.cover.meta };
}

export default async function CoverPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ side?: string }> }) {
  const { id } = await params;
  const { side } = await searchParams;
  const user = await requireUser(`/books/${id}/cover`);
  const book = await getAccessibleBook(id, user);
  const [locale, m] = await Promise.all([getLocale(), getMessages()]);
  const data = await v1WebRead({
    name: "book.coverPage",
    section: "book",
    locale,
    local: () => localCoverPageDto(book, locale, m),
    viaApi: (api) => api.webBookCoverPage({ bookId: book.id, locale }),
  });
  const sample: SpreadSample = {
    ...data.sample,
    toc: data.sample.toc.map(({ level, ...rest }) => ({
      ...rest,
      ...(level !== undefined ? { level: (level === 1 ? 1 : 0) as 0 | 1 } : {}),
    })),
  };
  return (
    <main className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-6">
      <CoverEditor
        bookId={book.id}
        // Пустое название обложка шаблона печатает названием по умолчанию (как PDF) — оно и на превью.
        defaultTitle={data.defaultTitle}
        format={book.format}
        // Страниц — как у печати: от них корешок и место своего фона на обороте и корешке.
        pages={data.pages}
        editable={book.status === "draft"}
        recipientLabel={data.recipientLabel}
        sample={sample}
        photos={data.photos}
        places={entriesToPlacePairs(data.places)}
        placeNames={data.placeNames}
        blank={bookKind(book.theme) === "blank"}
        theme={book.theme}
        year={book.occasionDate ? Number(book.occasionDate.slice(0, 4)) : new Date().getFullYear()}
        initial={{
          coverTemplate: book.coverTemplate,
          coverLines: book.coverLines,
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
          coverBack: parseCoverBack(book.coverBack),
        }}
        initialSide={side === "back" ? "back" : "front"}
      />
    </main>
  );
}
