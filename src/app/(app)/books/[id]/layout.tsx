import { Link } from "@/i18n/client";
import { isStaff, requireUser } from "@/server/auth";
import { LogoMark } from "@/components/Logo";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { ShopThemeToggle } from "@/components/ShopTheme";
import { ProfileMenu } from "@/components/AppNav";
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
import { BookBack, BookTitleRow } from "./BookTitleRow";
import { loadBookNav } from "./nav-data";
import { HelpChat } from "@/components/help/HelpChat";
import { getLocale, getMessages } from "@/i18n/server";

/**
 * Шапка книги: кто это (обложка, название, для кого, состояние) и лента пути — «Обзор», шаги работы с их состоянием,
 * письма и настройки. В книге она заменяет шапку кабинета (одна полоса вместо двух), лента закрепляется под ней на обзоре,
 * оформлении, макете, письмах и настройках.
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
      {/* Шапка книги вместо шапки кабинета: та же высота 56 px и то же место (липкая сверху), поэтому панели редакторов
          под ней не сдвигаются. Путь «Мои книги / книга» — слева, состояние и заказ — справа, рядом тема и профиль. */}
      <BookTitleRow>
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:gap-3 sm:px-6">
          {/* Назад к полке: на телефоне — стрелка (44 px), на компьютере — знак и подпись «Мои книги». */}
          <BookBack bookId={book.id} shelfLabel={t.myBooks} bookLabel={s.overview} />
          <Link href="/books" className="group hidden shrink-0 items-center gap-2.5 rounded-[10px] pr-1 text-sm text-muted hover:text-ink sm:flex">
            <LogoMark className="size-8 rounded-[8px]" />
            <span className="max-md:sr-only">{t.myBooks}</span>
          </Link>
          <span className="hidden text-line-strong sm:block" aria-hidden>
            /
          </span>
          <div className="w-7 shrink-0">
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
            <div className="truncate font-serif text-[17px] leading-tight font-medium sm:text-lg">{book.title}</div>
            <div className="truncate text-xs text-muted">
              {theme.name}
              {subject ? `, ${subject}` : ""}
            </div>
          </div>
          <Badge tone={state.tone} dot className="max-md:hidden">
            {state.label}
          </Badge>
          {book.status === "draft" ? (
            <OrderButton bookId={book.id} ready={nav.ready} />
          ) : order ? (
            <Link href={`/orders/${order.id}`} className="btn btn-outline btn-sm shrink-0">
              {t.order(order.number)}
            </Link>
          ) : null}
          <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
            <div className="mr-1 hidden lg:block">
              <LanguageSwitch />
            </div>
            <ShopThemeToggle className="size-11 max-sm:hidden" />
            <ProfileMenu name={user.name} email={user.email} isAdmin={isStaff(user)} orders help={book.userId === user.id} />
          </div>
        </div>
      </BookTitleRow>
      <BookTabs bookId={book.id} nav={nav} kind={kind === "blank" ? "blank" : "bank"} />
      {children}
      {/* Помощник — у владельца книги (сотрудник, открывший книгу клиента, в беседу клиента не пишет). */}
      {book.userId === user.id ? <HelpChat bookId={book.id} /> : null}
    </>
  );
}
