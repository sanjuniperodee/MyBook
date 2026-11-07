import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { CalendarHeart, Gift, Plus } from "lucide-react";
import { requireUser } from "@/server/auth";
import { container } from "@/server/container";
import { getTheme } from "@/lib/content/themes";
import { BLANK_READY_WORDS, bookKind } from "@/lib/content/kinds";
import { CoverPreview } from "@/components/cover/CoverPreview";
import { Morph } from "@/components/motion/PageTransition";
import { coverPhotoIds } from "@/lib/book/covers";
import { coverNames } from "@/lib/book/cover-names";
import { photoUrls } from "@/lib/urls";
import { formatDate, nowMs } from "@/lib/dates";
import { deadlineFor, getOccasion } from "@/lib/occasions";
import { getLocale, getMessages } from "@/i18n/server";
import { AgreementCard } from "@/components/AgreementCard";
import { cn } from "@/lib/class-names";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).books.list.meta };
}

/**
 * Полка автора: книги — как предметы (обложка в настоящих пропорциях), под каждой — название, где она на пути и тонкая
 * полоса готовности. Новая книга — пустое место на полке той же формы. Первый вход — приветствие и три шага пути.
 */
export default async function BooksPage() {
  const user = await requireUser("/books");
  const [rows, locale, m, agreement] = await Promise.all([container().authoring.queries.userBooks(user.id), getLocale(), getMessages(), container().ordering.orders.agreementFor(user.id)]);
  const card = agreement ? <AgreementCard agreement={agreement} books={rows.map((r) => ({ id: r.book.id, status: r.book.status, theme: r.book.theme, answered: r.answered, total: r.total, words: r.words }))} /> : null;
  const t = m.books.list;
  const now = new Date(nowMs());

  if (rows.length === 0) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-16">
        {card ? <div className="mb-10">{card}</div> : null}
        <div className="grid items-center gap-10 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)] md:gap-16">
          {/* Пустое место на полке: книга, которой ещё нет. Нажатие — тот же путь, что и главная кнопка. */}
          <Link
            href="/books/new"
            tabIndex={-1}
            aria-hidden
            className="group mx-auto flex aspect-[148/210] w-44 flex-col items-center justify-center gap-3 rounded-[4px] border border-dashed border-line-strong bg-white/50 text-muted transition-colors hover:border-wine/50 hover:text-wine md:w-full"
          >
            <span className="flex size-12 items-center justify-center rounded-full border border-line bg-white transition-colors group-hover:border-wine/40">
              <Plus className="size-5" />
            </span>
          </Link>
          <div>
            <h1 className="font-serif text-4xl leading-tight font-medium text-balance sm:text-5xl">{t.hello(user.name)}</h1>
            <p className="mt-3 max-w-lg text-[17px] leading-relaxed text-ink-soft">{t.firstText}</p>
            <ol className="mt-8 max-w-lg space-y-5">
              {t.firstSteps.map(([title, text], i) => (
                <li key={title} className="flex gap-4">
                  <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-medium tabular-nums", i === 0 ? "bg-wine text-white" : "border border-line-strong text-muted")}>{i + 1}</span>
                  <span className="pt-1">
                    <span className="block font-medium">{title}</span>
                    <span className="mt-0.5 block text-sm leading-relaxed text-muted">{text}</span>
                  </span>
                </li>
              ))}
            </ol>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
              <Link href="/books/new" className="btn btn-primary btn-lg">
                <Plus className="size-5" /> {t.create}
              </Link>
              <Link href="/redeem" className="inline-flex min-h-11 items-center justify-center gap-2 text-sm text-muted underline-offset-4 hover:text-wine hover:underline">
                <Gift className="size-4" aria-hidden /> {t.haveGift}
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      {card ? <div className="mb-8">{card}</div> : null}
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-serif text-4xl font-medium sm:text-5xl">{t.title}</h1>
          <p className="mt-1.5 text-sm text-muted sm:text-[15px]">{t.autosave}</p>
        </div>
        <Link href="/books/new" className="btn btn-primary shrink-0 max-sm:hidden">
          <Plus className="size-4" /> {t.newBook}
        </Link>
      </div>

      <ul className="mt-8 grid grid-cols-2 gap-x-5 gap-y-10 sm:mt-12 sm:grid-cols-3 sm:gap-x-8 lg:grid-cols-4 lg:gap-x-10">
        {rows.map(({ book, answered, total, words, photos }) => {
          const theme = getTheme(book.theme, locale);
          // Своя книга измеряется не ответами на вопросы, а объёмом: разделы и слова, полоса — путь к «почти готовой» книге.
          const blank = bookKind(book.theme) === "blank";
          const progress = blank ? Math.min(100, Math.round((words / BLANK_READY_WORDS) * 100)) : total ? Math.round((answered / total) * 100) : 0;
          const ordered = book.status !== "draft";
          const occasion = getOccasion(book.occasion);
          const dl = !ordered && occasion && book.occasionDate ? deadlineFor(book.occasionDate, now) : null;
          return (
            <li key={book.id}>
              <Link href={`/books/${book.id}`} className="group block rounded-[6px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-wine">
                <div className="transition-transform duration-300 ease-[var(--ease-out-soft)] group-hover:-translate-y-1">
                  <Morph name={`cover-${book.id}`}>
                    <CoverPreview
                      template={book.coverTemplate}
                      format={book.format}
                      title={book.title}
                      subtitle={book.subtitle}
                      names={coverNames(book)}
                      photos={photoUrls(coverPhotoIds(book), "thumb")}
                      design={book.coverDesign}
                      lite
                      className="rounded-[3px] shadow-book"
                    />
                  </Morph>
                </div>
                <div className="mt-4 text-xs text-muted">{theme.name}</div>
                <h2 className="mt-0.5 line-clamp-2 font-serif text-xl leading-snug font-medium group-hover:text-wine sm:text-[22px]">{book.title}</h2>
              </Link>
              <div className="mt-2 text-[13px] text-muted">
                {ordered ? (
                  <span className="font-medium text-success">{t.ordered}</span>
                ) : (
                  <>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate">{blank ? t.blankProgress(total, words) : t.answered(answered, total)}</span>
                      <span className="shrink-0 tabular-nums max-sm:hidden">{t.photos(photos)}</span>
                    </div>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={t.progress(progress)}>
                      <div className="bar-grow h-full rounded-full bg-wine" style={{ width: `${Math.max(progress, 2)}%` }} />
                    </div>
                  </>
                )}
                {dl && occasion && dl.state !== "past" ? (
                  <div className={cn("mt-2 flex items-start gap-1.5 text-xs leading-snug", dl.state === "relaxed" ? "text-muted" : "text-wine")} aria-label={t.deadlineAria}>
                    <CalendarHeart className="mt-px size-3.5 shrink-0" aria-hidden />
                    <span>
                      {m.common.deadline.chip(m.common.occasions[occasion.id].label, dl.daysToTarget)}
                      {dl.state === "relaxed" || dl.state === "soon" || dl.state === "urgent" ? m.common.deadline.chipOrderBy(dl.orderBy) : ""}
                    </span>
                  </div>
                ) : (
                  <div className="mt-2 text-xs max-sm:hidden">{t.updated(formatDate(book.updatedAt, false, locale))}</div>
                )}
              </div>
            </li>
          );
        })}
        <li>
          <Link
            href="/books/new"
            className="group flex aspect-[148/210] flex-col items-center justify-center gap-3 rounded-[4px] border border-dashed border-line-strong px-4 text-center text-muted transition-colors hover:border-wine/50 hover:bg-white/60 hover:text-wine focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-wine"
          >
            <span className="flex size-11 items-center justify-center rounded-full border border-line bg-white transition-colors group-hover:border-wine/40">
              <Plus className="size-5" aria-hidden />
            </span>
            <span className="text-sm font-medium text-ink group-hover:text-wine">{t.newBook}</span>
            <span className="text-xs leading-snug max-sm:hidden">{t.newBookHint}</span>
          </Link>
        </li>
      </ul>
    </main>
  );
}
