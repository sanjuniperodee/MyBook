import { Link } from "@/i18n/client";
import { requireUser } from "@/server/auth";
import { getAccessibleBook } from "@/server/books";
import { getTheme } from "@/lib/content/themes";
import { CoverPreview } from "@/components/cover/CoverPreview";
import { coverPhotoIds } from "@/lib/book/covers";
import { coverNames } from "@/lib/book/cover-names";
import { photoUrls } from "@/lib/urls";
import { container } from "@/server/container";
import { BookTabs } from "./BookTabs";
import { OrderButton } from "./OrderButton";
import { getLocale, getMessages } from "@/i18n/server";

/** Шапка «студии» книги: мини-обложка, название и вкладки разделов. */
export default async function BookLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/books/${id}`);
  const book = await getAccessibleBook(id, user);
  const [locale, m] = await Promise.all([getLocale(), getMessages()]);
  const t = m.books.layout;
  const theme = getTheme(book.theme, locale);
  const order = book.status === "draft" ? null : await container().ordering.queries.lastOrderOfBook(book.id);

  return (
    <>
      <div className="border-b border-line/70 bg-white/70">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex items-center gap-3 pt-2 sm:gap-4 sm:pt-4">
            <Link href="/books" className="hidden text-sm text-muted hover:text-ink sm:block">
              {t.myBooks}
            </Link>
            <span className="hidden text-line sm:block">/</span>
            <div className="w-6 shrink-0 sm:w-7">
              <CoverPreview
                template={book.coverTemplate}
                format={book.format}
                title={book.title}
                names={coverNames(book)}
                photos={photoUrls(coverPhotoIds(book))}
                lite
                className="rounded-[2px] shadow-sm"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-serif text-lg leading-tight font-medium sm:text-xl">{book.title}</div>
              <div className="truncate text-xs text-muted">
                {theme.name}
                {book.recipientName ? ` · ${book.recipientName}` : ""}
              </div>
            </div>
            {book.status === "draft" ? (
              <OrderButton bookId={book.id} />
            ) : order ? (
              <Link href={`/orders/${order.id}`} className="btn btn-dark btn-sm shrink-0">
                {t.order(order.number)}
              </Link>
            ) : null}
          </div>
          <div className="sm:mt-2">
            <BookTabs bookId={book.id} />
          </div>
        </div>
      </div>
      {children}
    </>
  );
}
