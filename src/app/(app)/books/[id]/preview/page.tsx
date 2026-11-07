import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { requireUser } from "@/server/auth";
import { getAccessibleBook } from "@/server/books";
import { PreviewTabs } from "./PreviewTabs";
import { getMessages } from "@/i18n/server";
import { container } from "@/server/container";
import { flipbookData } from "@/components/book3d/flipbook-data";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).books.preview.meta };
}

export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/books/${id}/preview`);
  const book = await getAccessibleBook(id, user);
  const [m, questions] = await Promise.all([getMessages(), container().authoring.queries.questions(book.id)]);
  const t = m.books.preview;

  // Переплёт 3D-книги — из того же содержимого, что PDF (название по умолчанию, имена, фото обложки и оборота);
  // страницы книга берёт из экранной сборки.
  const bundle = await container().authoring.queries.bundle(book.id);
  const flipbook = flipbookData(book, questions, bundle?.chapters ?? [], bundle?.photos ?? [], bundle?.letters ?? []);
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
      <PreviewTabs bookId={book.id} flipbook={flipbook} orderHref={orderHref} />
    </main>
  );
}
