import { CalendarHeart, ChevronRight, Gift, PenLine, Plus } from "lucide-react";
import { Link } from "@/i18n/client";
import { Badge } from "@/components/ui/Badge";
import { Book3D } from "@/components/cover/Book3D";
import { CoverPreview } from "@/components/cover/CoverPreview";
import { Morph } from "@/components/motion/PageTransition";
import { OpenBookLink } from "@/components/motion/OpenBookLink";
import { coverPhotoIds } from "@/lib/book/covers";
import { coverNames } from "@/lib/book/cover-names";
import { photoUrls } from "@/lib/urls";
import { cn } from "@/lib/class-names";
import { orderStatusLabel, orderStatusTone } from "@/modules/ordering/ui/status";
import type { OrderStatus } from "@/shared/domain/orders";
import type { Locale } from "@/i18n/config";
import type { getMessages } from "@/i18n/server";
import { nowKey, orderSteps, StatusTrack } from "../orders/StatusTrack";

type M = Awaited<ReturnType<typeof getMessages>>;

/** Всё, что нужно показать о книге на полке. Считает страница: карточке остаётся только разметка. */
export interface ShelfBook {
  /** Строка из userBooks: книга и её цифры. */
  row: {
    book: {
      id: string;
      title: string;
      subtitle: string;
      theme: string;
      format: string;
      coverTemplate: string;
      coverPhotoId: string | null;
      coverPhotoExtra?: string[] | null;
      coverDesign: unknown;
      authorName: string;
      recipientName: string;
      hideRecipientOnCover: boolean;
      namesOnCover: string;
    };
    answered: number;
    total: number;
    words: number;
    photos: number;
  };
  /** Название темы («Любимому человеку»). */
  kind: string;
  /** Своя книга: прогресс по словам и разделам, а не по ответам на вопросы. */
  blank: boolean;
  /** Готовность, 0–100. */
  progress: number;
  /** Последний заказ книги — у заказанной. */
  order: { id: string; number: number; status: OrderStatus; printed: boolean } | null;
  /** Заказана: правка закрыта, главное действие — следить за заказом. */
  ordered: boolean;
  /** Куда ведёт «Продолжить писать»: следующий раздел без ответа или начало редактора. */
  writeHref: string;
  /** Срок к празднику: уже собранная строка и тон. */
  deadline: { text: string; tone: "calm" | "warm" | "hot" } | null;
  /** Строка «Изменена …». */
  updated: string;
}

const coverProps = (b: ShelfBook["row"]["book"]) => ({
  template: b.coverTemplate,
  format: b.format,
  title: b.title,
  subtitle: b.subtitle,
  names: coverNames(b),
  design: b.coverDesign,
});

/** Прогресс книги: подпись, процент и полоса. Для заказанной книги не показывается. */
function Progress({ b, m, className }: { b: ShelfBook; m: M; className?: string }) {
  const t = m.books.list;
  const { answered, total, words } = b.row;
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 text-[15px] font-medium text-ink">{b.blank ? t.blankProgress(total, words) : t.ofQuestions(answered, total)}</span>
        <span className="shrink-0 text-sm text-muted tabular-nums">{b.progress}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={b.progress} aria-valuemin={0} aria-valuemax={100} aria-label={t.progress(b.progress)}>
        <div className="bar-grow h-full rounded-full bg-wine" style={{ width: `${Math.max(b.progress, 2)}%` }} />
      </div>
    </div>
  );
}

/** Строка срока: «Годовщина через 45 дней · заказать до 8 декабря». */
function Deadline({ d, aria, className }: { d: NonNullable<ShelfBook["deadline"]>; aria: string; className?: string }) {
  return (
    <div
      aria-label={aria}
      className={cn("flex items-start gap-2 rounded-[var(--r-ctl)] px-3 py-2 text-sm leading-snug", d.tone === "calm" && "bg-sunken text-ink-soft", d.tone === "warm" && "bg-warning-bg text-warning", d.tone === "hot" && "bg-rose text-wine", className)}
    >
      <CalendarHeart className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{d.text}</span>
    </div>
  );
}

/** Состояние заказанной книги: номер, статус и линейка этапов. */
function OrderState({ b, m, locale, className }: { b: ShelfBook; m: M; locale: Locale; className?: string }) {
  const o = m.orders.order;
  const order = b.order;
  if (!order)
    return (
      <div className={className}>
        <Badge tone="success">{m.books.list.ordered}</Badge>
      </div>
    );
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-[15px] font-medium">{m.orders.list.number(order.number)}</span>
        <Badge tone={orderStatusTone[order.status]}>{orderStatusLabel(order.status, locale, order.printed)}</Badge>
      </div>
      {order.status === "cancelled" ? null : <StatusTrack steps={orderSteps(order.printed, o.steps)} status={order.status} label={o.stepsAria} size="sm" className="mt-4 max-w-lg" />}
      <p className="mt-3 text-sm text-ink-soft">{o.now.title[nowKey(order.status, order.printed)]}</p>
    </div>
  );
}

/**
 * Главная книга: самая свежая из тех, что пишутся. Объёмная обложка слева (та же, что на странице книги, — переход между
 * ними «перетекает»), справа название, где книга на пути, срок и одно главное действие.
 */
export function HeroBook({ b, m, locale }: { b: ShelfBook; m: M; locale: Locale }) {
  const t = m.books.list;
  const { book, answered, words, photos } = b.row;
  const href = `/books/${book.id}`;
  return (
    // Телефон: обложка слева от названия, ниже — ход работы и «Продолжить писать» (действие — на первом экране).
    // Компьютер: крупная объёмная обложка слева, всё остальное — колонкой справа.
    <section
      aria-labelledby={`book-${book.id}`}
      className="grid grid-cols-[112px_minmax(0,1fr)] items-center gap-x-5 gap-y-6 [grid-template-areas:'cover_head'_'body_body'] md:grid-cols-[minmax(0,240px)_minmax(0,1fr)] md:gap-x-12 md:gap-y-0 md:[grid-template-areas:'cover_head'_'cover_body'] lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)] lg:gap-x-16"
    >
      {/* prefetch — страница книги грузится заранее: переход без заготовки, обложка «перетекает» сразу. */}
      <Link href={href} prefetch tabIndex={-1} aria-hidden className="block w-full [grid-area:cover] md:self-center">
        <Morph name={`cover-${book.id}`}>
          <Book3D {...coverProps(book)} bookId={book.id} photos={photoUrls(coverPhotoIds(book), "view")} rotate={18} />
        </Morph>
      </Link>
      <div className="min-w-0 [grid-area:head] md:self-end">
        <div className="text-sm text-muted">{b.kind}</div>
        <h2 id={`book-${book.id}`} className="mt-1 font-serif text-[30px] leading-[1.05] font-medium text-balance sm:text-5xl">
          <Link href={href} prefetch className="hover:text-wine">
            {book.title}
          </Link>
        </h2>
        {book.subtitle ? <p className="mt-2 font-serif text-base text-muted italic sm:text-xl">{book.subtitle}</p> : null}
      </div>
      <div className="min-w-0 [grid-area:body] md:self-start">
        {b.ordered ? (
          <OrderState b={b} m={m} locale={locale} className="max-w-xl md:mt-6" />
        ) : (
          <>
            <Progress b={b} m={m} className="max-w-xl md:mt-6" />
            <p className="mt-3 text-sm text-muted">
              {b.blank ? null : `${m.common.count.words(words)} · `}
              {m.common.count.photos(photos)} · {b.updated}
            </p>
          </>
        )}
        {b.deadline && !b.ordered ? <Deadline d={b.deadline} aria={t.deadlineAria} className="mt-4 max-w-xl" /> : null}

        <div className="mt-6 flex flex-col gap-3 sm:mt-7 sm:flex-row sm:items-center">
          {b.ordered ? (
            <>
              {b.order ? (
                <Link href={`/orders/${b.order.id}`} className="btn btn-primary btn-lg">
                  {t.trackOrder}
                </Link>
              ) : null}
              <Link href={href} prefetch className={cn("btn btn-lg", b.order ? "btn-outline" : "btn-primary")}>
                {t.open}
              </Link>
            </>
          ) : (
            <>
              {/* «Продолжить писать» — книга открывается на месте, её первая страница «перетекает» в лист редактора. */}
              <OpenBookLink bookId={book.id} href={b.writeHref} className="btn btn-primary btn-lg">
                <PenLine className="size-[18px]" aria-hidden /> {answered > 0 || words > 0 ? t.continue : t.start}
              </OpenBookLink>
              <Link href={href} prefetch className="btn btn-outline btn-lg">
                {t.open}
              </Link>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

/** Книга на второй полке: мини-обложка, название, прогресс и действие — компактная строка листа. */
export function ShelfCard({ b, m, locale }: { b: ShelfBook; m: M; locale: Locale }) {
  const t = m.books.list;
  const { book, answered, words, photos } = b.row;
  const href = `/books/${book.id}`;
  return (
    <li className="panel group relative flex gap-4 p-4 transition-colors hover:border-line-strong sm:p-5">
      <div className="w-20 shrink-0 sm:w-24">
        <Morph name={`cover-${book.id}`}>
          <CoverPreview {...coverProps(book)} photos={photoUrls(coverPhotoIds(book), "thumb")} lite className="rounded-[3px] shadow-book" />
        </Morph>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="text-xs text-muted">{b.kind}</div>
        <h3 className="mt-0.5 line-clamp-2 font-serif text-xl leading-snug font-medium group-hover:text-wine">
          {/* Вся карточка — ссылка на книгу; кнопка внизу — подпись действия. */}
          <Link href={href} className="after:absolute after:inset-0 after:content-['']">
            {book.title}
          </Link>
        </h3>
        {b.ordered ? (
          <OrderState b={b} m={m} locale={locale} className="mt-3" />
        ) : (
          <>
            <Progress b={b} m={m} className="mt-3" />
            <p className="mt-2 text-xs text-muted">
              {b.blank ? null : `${m.common.count.words(words)} · `}
              {m.common.count.photos(photos)}
            </p>
          </>
        )}
        {b.deadline && !b.ordered ? <Deadline d={b.deadline} aria={t.deadlineAria} className="mt-3 text-xs" /> : null}
        <div className="mt-auto pt-4">
          {b.ordered ? (
            <span className="inline-flex items-center gap-0.5 text-sm font-medium text-ink-soft group-hover:text-wine">
              {b.order ? t.trackOrder : t.open}
              <ChevronRight className="size-4" aria-hidden />
            </span>
          ) : (
            <span className="btn btn-outline btn-sm">
              <PenLine className="size-4" aria-hidden /> {answered > 0 || words > 0 ? t.continue : t.start}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * Пустая полка: приглашение к первой книге. Раскладка та же, что у главной книги (обложка слева, текст справа), только
 * обложка пока воображаемая, а ниже — три шага пути: выбрать, отвечать, заказать.
 */
export function FirstBook({ name, m }: { name: string; m: M }) {
  const t = m.books.list;
  return (
    <div>
      <section className="grid items-center gap-8 md:grid-cols-[minmax(0,240px)_minmax(0,1fr)] md:gap-12 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)] lg:gap-16">
        <Link href="/books/new" tabIndex={-1} aria-hidden className="mx-auto block w-full max-w-[170px] md:max-w-none">
          <Book3D template="peony" title={t.firstCoverTitle} names={name} rotate={18} />
        </Link>
        <div className="min-w-0">
          <h1 className="font-serif text-4xl leading-[1.05] font-medium text-balance sm:text-5xl">{t.hello(name)}</h1>
          <p className="mt-4 max-w-lg text-[17px] leading-relaxed text-ink-soft">{t.firstText}</p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
            <Link href="/books/new" className="btn btn-primary btn-lg">
              <Plus className="size-5" aria-hidden /> {t.create}
            </Link>
            <Link href="/redeem" className="inline-flex min-h-11 items-center justify-center gap-2 text-sm text-muted underline-offset-4 hover:text-wine hover:underline">
              <Gift className="size-4" aria-hidden /> {t.haveGift}
            </Link>
          </div>
        </div>
      </section>
      <ol className="mt-12 grid gap-6 border-t border-line pt-8 sm:grid-cols-3 sm:gap-8 md:mt-16">
        {t.firstSteps.map(([title, text], i) => (
          <li key={title} className="flex gap-4">
            <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-medium tabular-nums", i === 0 ? "bg-wine text-white" : "border border-line-strong text-muted")}>{i + 1}</span>
            <span className="pt-0.5">
              <span className="block font-medium">{title}</span>
              <span className="mt-1 block text-sm leading-relaxed text-muted">{text}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
