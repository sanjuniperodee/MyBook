import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { requireUser } from "@/server/auth";
import { getAccessibleBook } from "@/server/books";
import { CoverPreview } from "@/components/cover/CoverPreview";
import { coverNamesLine } from "@/lib/book/covers";
import { photoUrl } from "@/lib/urls";
import { PreviewTabs } from "./PreviewTabs";
import { getMessages } from "@/i18n/server";
import { container } from "@/server/container";
import { buildBookContent, estimatePages } from "@/lib/book/layout";
import { printablePageCount } from "@/lib/book/formats";
import { site } from "@/config/site";
import { splitParagraphs } from "@/lib/book/inline-photo";
import type { FlipbookData } from "@/components/book3d/Flipbook3D";

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
  const names = coverNamesLine(book.authorName, book.recipientName, book.hideRecipientOnCover);
  const photo = book.coverPhotoId ? photoUrl(book.coverPhotoId, "full") : undefined;
  const flipbook: FlipbookData = {
    cover: { template: book.coverTemplate, format: book.format, title: book.title, subtitle: book.subtitle, names, photoUrl: photo },
    language: content.language,
    formatId: content.format.id,
    interiorId: content.interior.id,
    title: content.title,
    subtitle: content.subtitle,
    author: content.authorName,
    year: content.year,
    dedication: content.dedication,
    showToc: content.showToc,
    model: { pageCount: printablePageCount(estimatePages(content)), backText: book.backText, brand: site.name.toUpperCase() },
    chapters: content.chapters.map((c) => ({
      number: c.number,
      title: c.title,
      epigraph: c.epigraph,
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
              photoUrl={photo}
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
