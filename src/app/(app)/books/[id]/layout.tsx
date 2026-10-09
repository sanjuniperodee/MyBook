import { Link } from "@/i18n/client";
import { requireUser } from "@/server/auth";
import { getAccessibleBook } from "@/server/books";
import { getTheme } from "@/lib/content/themes";
import { CoverPreview } from "@/components/cover/CoverPreview";
import { coverNamesLine, coverPhotoIds } from "@/lib/book/covers";
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
          <div className="flex items-center gap-4 pt-4">
            <Link href="/books" className="hidden text-sm text-muted hover:text-ink sm:block">
              {t.myBooks}
            </Link>
            <span className="hidden text-line sm:block">/</span>
            <div className="w-7 shrink-0">
              <CoverPreview
                template={book.coverTemplate}
                format={book.format}
                title={book.title}
                names={coverNamesLine(book.authorName, book.recipientName, book.hideRecipientOnCover)}
                photos={photoUrls(coverPhotoIds(book))}
                lite
                className="rounded-[2px] shadow-sm"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-serif text-xl leading-tight font-medium">{book.title}</div>
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
          <div className="mt-2">
            <BookTabs bookId={book.id} />
          </div>
        </div>
      </div>
      {children}
    </>
  );
}
