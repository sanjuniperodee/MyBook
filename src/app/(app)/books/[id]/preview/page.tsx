import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { requireUser } from "@/server/auth";
import { getAccessibleBook } from "@/server/books";
import { CoverPreview } from "@/components/cover/CoverPreview";
import { backContent, backPhotoIds } from "@/lib/book/cover-back";
import { coverPhotoIds } from "@/lib/book/covers";
import { coverNames } from "@/lib/book/cover-names";
import { photoUrl } from "@/lib/urls";
import { backPhotoRefs, coverPhotoRefs } from "@/lib/book/photo-refs";
import { PreviewTabs } from "./PreviewTabs";
import { getMessages } from "@/i18n/server";
import { container } from "@/server/container";
import { estimatePages } from "@/lib/book/estimate";
import { photoPages, toPhotoItem, type PhotoItem } from "@/lib/book/layout";
import { buildBookContent } from "@/lib/book/book-content";
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

  // Листаемая книга строится из тех же данных, что и PDF: ответы, фото в ответах, фотостраницы глав, галерея, письма.
  const bundle = await container().authoring.queries.bundle(book.id);
  const allPhotos = bundle?.photos ?? [];
  const content = buildBookContent(book, questions, allPhotos.map(toPhotoItem), bundle?.chapters ?? [], undefined, bundle?.letters ?? []);
  const backPhotos = backPhotoIds(book).flatMap((id) => allPhotos.filter((p) => p.id === id));
  const names = coverNames(book);
  const photos = coverPhotoRefs(coverPhotoIds(book), allPhotos, book, "view");
  const pagePhoto = (p: PhotoItem) => ({ id: p.id, url: photoUrl(p.id, "view"), width: p.width, height: p.height, caption: p.caption, layout: p.layout });
  const flipbook: FlipbookData = {
    // Название — как в PDF (с названием по умолчанию, если поле пустое), а не сырое поле книги.
    cover: { template: book.coverTemplate, format: book.format, title: content.title, subtitle: book.subtitle, names, photos },
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
      backPhotos: backPhotoRefs(backPhotos, book, "view"),
    },
    chapters: content.chapters.map((c) => ({
      number: c.number,
      title: c.title,
      epigraph: c.epigraph,
      openerPhoto: c.openerPhoto ? photoUrl(c.openerPhoto.id, "view") : undefined,
      entries: c.items.flatMap((it) => {
        const paragraphs = splitParagraphs(it.answer);
        const inline = (it.photos ?? []).map((p) => ({ id: p.id, url: photoUrl(p.id, "view"), width: p.width, height: p.height, caption: p.caption, inline: p.inline }));
        return paragraphs.length || inline.length ? [{ heading: it.heading, paragraphs, photos: inline }] : [];
      }),
      photoPages: photoPages(c.photos).map((group) => group.map(pagePhoto)),
    })),
    gallery: content.galleryPhotos.length ? { title: content.galleryTitle, pages: photoPages(content.galleryPhotos).map((group) => group.map(pagePhoto)) } : undefined,
  };
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-3xl font-medium sm:text-5xl">{t.title}</h1>
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
