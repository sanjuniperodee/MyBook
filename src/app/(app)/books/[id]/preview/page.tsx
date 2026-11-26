import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { requireUser } from "@/server/auth";
import { getAccessibleBook } from "@/server/books";
import { localPreviewPageDtoForUser } from "@/server/v1-local-bridge-book";
import { v1WebRead } from "@/server/v1-web-client";
import type { FlipbookData } from "@/components/book3d/pages";
import { PreviewTabs } from "./PreviewTabs";
import { getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).books.preview.meta };
}

export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/books/${id}/preview`);
  const book = await getAccessibleBook(id, user);
  const [m, data] = await Promise.all([
    getMessages(),
    v1WebRead({
      name: "book.previewPage",
      section: "book",
      local: () => localPreviewPageDtoForUser(book, user),
      viaApi: (api) => api.webBookPreviewPage({ bookId: book.id }),
    }),
  ]);
  const t = m.books.preview;
  const flipbook: FlipbookData = {
    ...data.flipbook,
    cover: {
      ...data.flipbook.cover,
      photos: data.flipbook.cover.photos.map((p) => p ?? undefined),
    },
  };
  const orderHref = book.status === "draft" ? `/books/${book.id}/checkout` : null;
  return (
    <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-6">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="font-serif text-[30px] leading-tight font-medium sm:text-[36px]">{t.title}</h1>
          <p className="mt-1 max-w-2xl text-[15px] leading-relaxed text-pretty text-muted max-sm:hidden">{m.books.tools.preview}</p>
        </div>
        {orderHref ? (
          <Link href={orderHref} className="btn btn-primary max-sm:w-full">
            {t.order}
          </Link>
        ) : null}
      </header>
      <PreviewTabs bookId={book.id} flipbook={flipbook} orderHref={orderHref} editable={data.editable} />
    </main>
  );
}
