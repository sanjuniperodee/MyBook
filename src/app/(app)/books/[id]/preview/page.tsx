import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { requireUser } from "@/server/auth";
import { getAccessibleBook } from "@/server/books";
import { CoverPreview } from "@/components/cover/CoverPreview";
import { backContent, backPhotoIds } from "@/lib/book/cover-back";
import { coverNamesLine, coverPhotoIds } from "@/lib/book/covers";
import { photoUrl, photoUrls } from "@/lib/urls";
import { PreviewTabs } from "./PreviewTabs";
import { getMessages } from "@/i18n/server";
import { container } from "@/server/container";
import { buildBookContent, estimatePages, toPhotoItem } from "@/lib/book/layout";
import { printablePageCount } from "@/lib/book/formats";
import { site } from "@/config/site";
import { splitParagraphs } from "@/lib/book/inline-photo";
import type { FlipbookData } from "@/components/book3d/pages";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).books.preview.meta };
}

export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/books/${id}/preview`);
  const book = await getAccessibleBook(id, user);
  const [t, questions] = await Promise.all([getMessages().then((m) => m.books.preview), container().authoring.queries.questions(book.id)]);

  // Листаемая книга строится из тех же данных, что и PDF (без фото: их точное место видно в PDF).
  const content = buildBookContent(book, questions, []);
  const allPhotos = await container().authoring.queries.photos(book.id);
  const backPhotos = backPhotoIds(book).flatMap((id) => allPhotos.filter((p) => p.id === id));
  const names = coverNamesLine(book.authorName, book.recipientName, book.hideRecipientOnCover);
  const photos = photoUrls(coverPhotoIds(book), "full");
  // Оформления, где глава открывается фото: снимки начальных полос — по той же раскладке фото, что в PDF.
  const openers = content.interior.opener.photo
    ? new Map(buildBookContent(book, questions, allPhotos.map(toPhotoItem)).chapters.flatMap((c) => (c.openerPhoto ? [[c.key, photoUrl(c.openerPhoto.id, "full")] as const] : [])))
    : new Map<string, string>();
  const flipbook: FlipbookData = {
    cover: { template: book.coverTemplate, format: book.format, title: book.title, subtitle: book.subtitle, names, photos },
    language: content.language,
    formatId: content.format.id,
    interiorId: content.interior.id,
    title: content.title,
    subtitle: content.subtitle,
    author: content.authorName,
    year: content.year,
    dedication: content.dedication,
    showToc: content.showToc,
    model: {
      pageCount: printablePageCount(estimatePages(content)),
      brand: site.name.toUpperCase(),
      back: backContent(book, backPhotos.map((p) => ({ width: p.width, height: p.height })), new Date()),
      backPhotos: photoUrls(backPhotos.map((p) => p.id), "full"),
    },
    chapters: content.chapters.map((c) => ({
      number: c.number,
      title: c.title,
      epigraph: c.epigraph,
      openerPhoto: openers.get(c.key),
      entries: c.items.flatMap((it) => {
        const paragraphs = splitParagraphs(it.answer);
        return paragraphs.length ? [{ heading: it.heading, paragraphs }] : [];
      }),
    })),
  };
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
              names={names}
              photos={photos}
              className="rounded-[3px] shadow-book"
            />
            <Link href={`/books/${book.id}/cover`} className="mt-3 block text-center text-sm text-wine hover:underline">
              {t.changeCover}
            </Link>
          </div>
        </div>
        <PreviewTabs bookId={book.id} initialVersion={book.updatedAt.getTime()} flipbook={flipbook} />
      </div>
    </main>
  );
}
