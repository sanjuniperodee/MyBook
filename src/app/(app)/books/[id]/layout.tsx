import { ChevronLeft } from "lucide-react";
import { Link } from "@/i18n/client";
import { requireUser } from "@/server/auth";
import { getAccessibleBook } from "@/server/books";
import { getTheme } from "@/lib/content/themes";
import { bookKind } from "@/lib/content/kinds";
import { CoverPreview } from "@/components/cover/CoverPreview";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { coverPhotoIds } from "@/lib/book/covers";
import { coverNames } from "@/lib/book/cover-names";
import { photoUrls } from "@/lib/urls";
import { isPrintedPlan, orderStatusLabel, orderStatusTone } from "@/modules/ordering/ui/status";
import type { OrderStatus } from "@/shared/domain/orders";
import { BookTabs } from "./BookTabs";
import { OrderButton } from "./OrderButton";
import { BookTitleRow } from "./BookTitleRow";
import { loadBookNav } from "./nav-data";
import { HelpChat } from "@/components/help/HelpChat";
import { getLocale, getMessages } from "@/i18n/server";

/**
 * Шапка книги: кто это (обложка, название, для кого, состояние) и лента пути — «Обзор», шаги работы с их состоянием,
 * письма и настройки. Лента закрепляется под шапкой кабинета на обзоре, оформлении, макете, письмах и настройках.
 */
export default async function BookLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/books/${id}`);
  const book = await getAccessibleBook(id, user);
  const [locale, m] = await Promise.all([getLocale(), getMessages()]);
  const t = m.books.layout;
  const s = m.bookStudio.nav;
  const theme = getTheme(book.theme, locale);
  const kind = bookKind(book.theme);
  // У автобиографии получателя нет — вместо него автор; у своей книги получатель необязателен.
  const subject = (kind === "autobiography" ? book.authorName : book.recipientName).trim();
  const nav = await loadBookNav(book, locale);
  const order = book.status === "draft" ? null : nav.order;
  const state: { label: string; tone: BadgeTone } =
    book.status !== "draft" && order
      ? { label: orderStatusLabel(order.status, locale, isPrintedPlan(order.plan)), tone: orderStatusTone[order.status as OrderStatus] ?? "neutral" }
      : nav.ready
        ? { label: s.badge.ready, tone: "success" }
        : { label: s.badge.writing, tone: "neutral" };

  return (
    <>
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <BookTitleRow>
          {/* Назад к полке: на телефоне — стрелка (44 px), на компьютере — подпись. */}
          <Link href="/books" aria-label={t.myBooks} className="-ml-2.5 flex size-11 shrink-0 items-center justify-center rounded-[10px] text-muted hover:bg-ink/5 hover:text-ink sm:hidden">
            <ChevronLeft className="size-5" aria-hidden />
          </Link>
          <Link href="/books" className="hidden h-9 shrink-0 items-center gap-1 rounded-lg pr-2 text-sm text-muted hover:text-ink sm:flex">
            <ChevronLeft className="size-4" aria-hidden /> {t.myBooks}
          </Link>
          <span className="hidden h-6 w-px bg-line sm:block" aria-hidden />
          <div className="w-7 shrink-0 sm:ml-1 sm:w-8">
            <CoverPreview
              template={book.coverTemplate}
              format={book.format}
              title={book.title}
              names={coverNames(book)}
              photos={photoUrls(coverPhotoIds(book))}
              design={book.coverDesign}
              lite
              className="rounded-[2px] shadow-sm"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-serif text-lg leading-tight font-medium sm:text-xl">{book.title}</div>
            <div className="truncate text-xs text-muted">
              {theme.name}
              {subject ? `, ${subject}` : ""}
            </div>
          </div>
          <Badge tone={state.tone} dot className="max-sm:hidden">
            {state.label}
          </Badge>
          {book.status === "draft" ? (
            <OrderButton bookId={book.id} />
          ) : order ? (
            <Link href={`/orders/${order.id}`} className="btn btn-outline btn-sm shrink-0">
              {t.order(order.number)}
            </Link>
          ) : null}
        </BookTitleRow>
      </div>
      <BookTabs bookId={book.id} nav={nav} kind={kind === "blank" ? "blank" : "bank"} />
      {children}
      {/* Помощник — у владельца книги (сотрудник, открывший книгу клиента, в беседу клиента не пишет). */}
      {book.userId === user.id ? <HelpChat bookId={book.id} /> : null}
    </>
  );
}
