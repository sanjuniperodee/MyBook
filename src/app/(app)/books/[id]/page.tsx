import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { OpenBookLink } from "@/components/motion/OpenBookLink";
import { ChevronRight, CircleAlert, Mail, MessageCircle, PenLine, TriangleAlert } from "lucide-react";
import { requireUser } from "@/server/auth";
import { getAccessibleBook } from "@/server/books";
import { Book3D } from "@/components/cover/Book3D";
import { Morph } from "@/components/motion/PageTransition";
import { coverPhotoIds } from "@/lib/book/covers";
import { coverNames } from "@/lib/book/cover-names";
import { coverPhotoRefs } from "@/lib/book/photo-refs";
import { getLocale, getMessages } from "@/i18n/server";
import { site } from "@/config/site";
import { cn } from "@/lib/class-names";
import { BookMenu } from "./BookMenu";
import { DeadlineBanner } from "@/components/DeadlineBanner";
import { AgreementCard } from "@/components/AgreementCard";
import { StepNode } from "./StepNode";
import { bookHub } from "@/server/book-hub";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).books.hub.meta };
}

/** Заголовок блока обзора: мелкий, тушью — как у листов кабинета. */
function BlockTitle({ id, children, aside }: { id: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 id={id} className="text-[17px] font-semibold">
        {children}
      </h2>
      {aside ? <span className="text-sm text-muted">{aside}</span> : null}
    </div>
  );
}

/**
 * Штаб книги: сама книга, где мы на пути к заказу, что делать дальше и чего не хватает. Состояние шагов — bookNav,
 * та же модель, что в ленте разделов над страницей.
 */
export default async function BookHubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/books/${id}`);
  const book = await getAccessibleBook(id, user);
  const [locale, m] = await Promise.all([getLocale(), getMessages()]);
  // Расчёт штаба (шаги, следующий шаг, замечания, главы, письма) — общий с приложением: src/server/book-hub.ts.
  const hub = await bookHub(book, locale, m);
  const { stats, photos, printedPages, agreement, editable, blank, chapters, sectionHref, rows, card, needs, hasErrors } = hub;
  const t = m.books.hub;
  const s = m.bookStudio.hub;
  const nv = m.bookStudio.nav;

  // Главы: первые шесть на виду, остальные — под «Все главы»; длинный список не растягивает страницу.
  const shownChapters = chapters.slice(0, 6);
  const moreChapters = chapters.slice(6);
  const chapterRow = (ch: (typeof chapters)[number], i: number) => {
    const done = ch.total > 0 && ch.answered === ch.total;
    const href = ch.firstOpenId ?? ch.firstId;
    return (
      <li key={ch.key}>
        <Link href={sectionHref(href)} className="group block rounded-[10px] px-2 py-2.5 hover:bg-sunken/70">
          <span className="flex items-baseline gap-3">
            <span className="w-5 shrink-0 text-right text-xs text-muted tabular-nums">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate text-[15px] group-hover:text-wine" lang={book.language}>
              {ch.title}
            </span>
            <span className={cn("shrink-0 text-xs tabular-nums", done ? "font-medium text-success" : "text-muted")}>{ch.total ? t.chapterSections(ch.answered, ch.total) : t.chapterEmpty}</span>
          </span>
          <span aria-hidden className="mt-1.5 ml-8 block h-[3px] overflow-hidden rounded-full bg-line">
            <span className={cn("block h-full rounded-full", done ? "bg-success" : "bg-wine")} style={{ width: `${ch.total ? Math.round((ch.answered / ch.total) * 100) : 0}%` }} />
          </span>
        </Link>
      </li>
    );
  };


  const lettersHref = hub.letters.href;

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      {agreement ? (
        <div className="mb-6">
          <AgreementCard agreement={agreement} books={[{ id: book.id, status: book.status, theme: book.theme, answered: stats.answered, total: stats.total, words: stats.words }]} />
        </div>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-14 gap-y-6 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
        {/* Книга: на телефоне — обложка слева от названия, на компьютере — крупно, закреплена, пока читаешь штаб */}
        <header className="flex items-center gap-4 lg:sticky lg:top-[8.5rem] lg:block lg:self-start">
          <div className="w-[92px] shrink-0 md:w-[150px] lg:mx-0 lg:w-full lg:max-w-[280px]">
            <Morph name={`cover-${book.id}`}>
              <Book3D
                bookId={book.id}
                template={book.coverTemplate}
                lines={book.coverLines}
                format={book.format}
                title={book.title}
                subtitle={book.subtitle}
                names={coverNames(book)}
                photos={coverPhotoRefs(coverPhotoIds(book), photos, book, "view")}
                design={book.coverDesign}
                rotate={18}
                thickness={Math.min(14, 4 + printedPages / 20)}
              />
            </Morph>
          </div>
          <div className="min-w-0 lg:mt-9">
            <h1 className="font-serif text-[28px] leading-[1.08] font-medium text-balance sm:text-4xl lg:text-[40px]">{book.title}</h1>
            {book.subtitle ? <p className="mt-1 font-serif text-lg text-muted italic lg:mt-2 lg:text-xl">{book.subtitle}</p> : null}
          </div>
        </header>

        <div className="min-w-0 space-y-7">
          {/* Следующий шаг — одно главное действие */}
          {card ? (
            <section aria-label={s.next.label} className="panel p-5 sm:p-6">
              <div className="text-xs text-muted">{card.eyebrow}</div>
              {card.serif ? (
                <Link href={card.primary.href} className="mt-2 line-clamp-3 block font-serif text-[22px] leading-snug text-ink hover:text-wine sm:text-2xl" lang={card.lang}>
                  {card.title}
                </Link>
              ) : (
                <h2 className="mt-2 font-serif text-[26px] leading-tight font-medium text-balance sm:text-3xl">{card.title}</h2>
              )}
              {card.text ? <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-ink-soft">{card.text}</p> : null}
              <div className="mt-5 flex flex-wrap items-center gap-2.5">
                {/* «Ответить» в редактор — книга слева открывается, её страница «перетекает» в лист; остальное — обычная ссылка. */}
                {card.primary.icon ? (
                  <OpenBookLink bookId={book.id} href={card.primary.href} className="btn btn-primary max-sm:w-full">
                    <PenLine className="size-4" aria-hidden />
                    {card.primary.label}
                  </OpenBookLink>
                ) : (
                  <Link href={card.primary.href} prefetch className="btn btn-primary max-sm:w-full">
                    {card.primary.label}
                  </Link>
                )}
                {card.secondary ? (
                  <Link href={card.secondary.href} className="btn btn-outline max-sm:w-full">
                    {card.secondary.label}
                  </Link>
                ) : null}
              </div>
              {card.more ? (
                <p className="mt-4 border-t border-line pt-3 text-sm text-muted">
                  {card.more.text ? `${card.more.text}. ` : null}
                  <Link href={card.more.href} className="font-medium text-wine hover:underline">
                    {card.more.label}
                  </Link>
                </p>
              ) : null}
            </section>
          ) : null}

          {editable ? <DeadlineBanner bookId={book.id} occasion={book.occasion} occasionDate={book.occasionDate} answered={stats.answered} flush /> : null}

          {/* Путь книги: шаги и их состояние */}
          <section aria-labelledby="book-path">
            <BlockTitle id="book-path">{s.path.title}</BlockTitle>
            <ol aria-label={s.path.aria} className="panel divide-y divide-line overflow-hidden">
              {rows.map((r, i) => {
                const st = r;
                const active = r.active;
                return (
                  <li key={r.key}>
                    <Link href={r.href} className={cn("group flex min-h-[4.25rem] items-center gap-3.5 px-4 py-3 transition-colors hover:bg-sunken/60", active && "bg-rose/40 hover:bg-rose/60")}>
                      <StepNode status={st.status} fraction={st.fraction} n={i + 1} size="lg" current={active} surface="bg-white" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="text-[15px] font-medium group-hover:text-wine">{r.title}</span>
                          <span className="sr-only">, {nv.state[st.status]}</span>
                        </span>
                        <span className={cn("block truncate text-sm", st.status === "attention" ? "text-warning" : "text-muted")}>{r.value}</span>
                        {r.bar !== undefined && st.status !== "done" ? (
                          <span aria-hidden className="mt-1.5 block h-[3px] max-w-56 overflow-hidden rounded-full bg-line">
                            <span className="block h-full rounded-full bg-wine" style={{ width: `${Math.max(r.bar, 2)}%` }} />
                          </span>
                        ) : null}
                      </span>
                      <span className={cn("shrink-0 text-sm font-medium max-sm:sr-only", active ? "text-wine" : "text-ink-soft group-hover:text-wine")}>{r.action}</span>
                      <ChevronRight className="size-4 shrink-0 text-muted group-hover:text-wine" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ol>
          </section>

          {needs.length ? (
            <section aria-labelledby="book-needs">
              <BlockTitle id="book-needs" aside={<span className="count">{needs.length}</span>}>
                {hasErrors ? s.needs.errors : s.needs.warnings}
              </BlockTitle>
              <ul className="panel divide-y divide-line overflow-hidden">
                {needs.map((i) => (
                  <li key={i.text} className="flex items-start gap-3 px-4 py-3 text-sm">
                    {i.level === "error" ? <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden /> : <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />}
                    <span className="min-w-0 flex-1 text-ink-soft">{i.text}</span>
                    {i.href ? (
                      <Link href={i.href} className="shrink-0 font-medium text-wine hover:underline">
                        {s.needs.fix}
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>

      <div className="mt-10 grid grid-cols-[minmax(0,1fr)] gap-8 sm:mt-14 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-12">
        {/* Главы: первые шесть, остальные по кнопке */}
        <section aria-labelledby="book-chapters">
          <BlockTitle id="book-chapters" aside={chapters.length ? t.chaptersStarted(chapters.filter((ch) => ch.answered > 0).length, chapters.length) : undefined}>
            {t.chapters}
          </BlockTitle>
          {chapters.length === 0 ? (
            blank ? <p className="rounded-[14px] border border-dashed border-line-strong p-5 text-sm text-muted">{t.createFirstChapterText}</p> : null
          ) : (
            <div className="-mx-2">
              <ol className="grid gap-x-8 sm:grid-cols-2">{shownChapters.map((ch, i) => chapterRow(ch, i))}</ol>
              {moreChapters.length ? (
                <details className="group/more">
                  <summary className="mx-2 mt-2 inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-wine hover:underline [&::-webkit-details-marker]:hidden">
                    <ChevronRight className="size-4 transition group-open/more:rotate-90" aria-hidden /> {t.allChapters(chapters.length)}
                  </summary>
                  <ol className="grid gap-x-8 sm:grid-cols-2" start={7}>
                    {moreChapters.map((ch, i) => chapterRow(ch, i + 6))}
                  </ol>
                </details>
              ) : null}
            </div>
          )}
        </section>

        {/* Рядом с книгой — письма близких и помощь; фото и настройки — в шагах и значке ленты, здесь их не повторяем */}
        <aside className="space-y-4">
          <section className="panel p-4 sm:p-5" aria-labelledby="hub-letters">
            <h2 id="hub-letters" className="flex items-center gap-2 text-[15px] font-semibold">
              <Mail className="size-4 text-wine" strokeWidth={1.8} aria-hidden /> {s.lower.lettersTitle}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{hub.letters.text}</p>
            <Link href={lettersHref} className="btn btn-outline btn-sm mt-3">
              {hub.letters.action}
            </Link>
          </section>

          <div className="flex items-center justify-between gap-3 px-1">
            <a href={site.contacts.whatsapp} target="_blank" rel="noopener noreferrer" className="flex min-h-11 min-w-0 items-center gap-3 text-sm">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-sunken text-ink-soft">
                <MessageCircle className="size-4" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block font-medium">{t.help}</span>
                <span className="text-muted">{t.helpText}</span>
              </span>
            </a>
            <BookMenu bookId={book.id} editable={editable} />
          </div>
        </aside>
      </div>
    </main>
  );
}
