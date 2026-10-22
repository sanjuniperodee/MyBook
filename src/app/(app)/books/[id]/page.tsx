import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { ArrowRight, BookOpenText, Camera, Check, Eye, Mail, MessageCircle, Palette, PenLine, SlidersHorizontal, Truck } from "lucide-react";
import { requireUser } from "@/server/auth";
import { getAccessibleBook } from "@/server/books";
import { container } from "@/server/container";
import { chapterTitle, getTheme } from "@/lib/content/themes";
import { applyGender } from "@/lib/content/gender";
import { BLANK_READY_WORDS, bookKind, progressOf } from "@/lib/content/kinds";
import { messagesFor } from "@/i18n/messages";
import { questionTexts } from "@/lib/book/layout";
import { sectionLabel } from "@/lib/book/editor-model";
import { Book3D } from "@/components/cover/Book3D";
import { Morph } from "@/components/motion/PageTransition";
import { coverPhotoIds } from "@/lib/book/covers";
import { coverNames } from "@/lib/book/cover-names";
import { hubChapters, sectionHref as sectionLink } from "@/lib/book/hub-model";
import { photoUrl } from "@/lib/urls";
import { coverPhotoRefs } from "@/lib/book/photo-refs";
import { getFormat, print } from "@/lib/book/formats";
import { getLocale, getMessages } from "@/i18n/server";
import { coverName, interiorName } from "@/i18n/labels";
import { localeMeta } from "@/i18n/config";
import { site } from "@/config/site";
import { orderStatusLabel, isPrintedPlan } from "@/modules/ordering/ui/status";
import { isPaid } from "@/modules/ordering/domain";
import { cn } from "@/lib/class-names";
import { BookMenu } from "./BookMenu";
import { DeadlineBanner } from "@/components/DeadlineBanner";
import { AgreementCard } from "@/components/AgreementCard";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).books.hub.meta };
}

export default async function BookHubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/books/${id}`);
  const book = await getAccessibleBook(id, user);
  const [stats, questions, ownChapters, photos, [order], letterRows, built] = await Promise.all([
    container().authoring.queries.stats(book),
    container().authoring.queries.questions(book.id),
    container().authoring.queries.chapters(book.id),
    container().authoring.queries.photos(book.id),
    container().ordering.queries.lastOrderOfBook(book.id).then((o) => (o ? [o] : [])),
    container().authoring.queries.letters(book.id),
    // Готовый макет текущей книги — точное число страниц (как в предпросмотре); нет — оценка со знаком «≈».
    container().previews.current(book.id).catch(() => null),
  ]);
  const printedPages = built?.pageCount ?? stats.printedPages;
  const contentPages = built?.contentPages ?? stats.estimatedPages;
  // Договорённость с менеджером и внесённая предоплата — клиенту видно, что уже оплачено и что остаётся.
  const agreement = book.status === "draft" ? await container().ordering.orders.agreementFor(book.userId) : null;
  const letterStats = {
    approved: letterRows.filter((l) => l.status === "approved").length,
    pending: letterRows.filter((l) => l.status === "pending").length,
  };
  const [locale, m] = await Promise.all([getLocale(), getMessages()]);
  const t = m.books.hub;
  const c = m.common;
  // Главы и вопросы — на языке книги (это её содержимое), подписи вокруг — на языке интерфейса.
  const theme = getTheme(book.theme, book.language);
  const g = (s: string) => applyGender(s, book.authorGender, book.recipientGender);
  const kind = bookKind(book.theme);
  // Главы своей книги — названия автора (без подстановки рода), остальных — из темы.
  const ownTitles = new Map(ownChapters.map((ch) => [ch.key, ch.title.trim()]));
  const titleOf = (key: string) => (kind === "blank" ? ownTitles.get(key) || messagesFor(book.language).book.untitledChapter : g(chapterTitle(theme, key, book.language)));
  const editable = book.status === "draft";
  const blank = kind === "blank";
  const base = `/books/${book.id}`;
  // Полоса прогресса: у книг с банком — доля вопросов с ответом, у своей книги — путь к «почти готовой» книге по словам.
  const percent = blank ? Math.min(100, Math.round((stats.words / BLANK_READY_WORDS) * 100)) : stats.total ? Math.round((stats.answered / stats.total) * 100) : 0;
  const chapters = hubChapters(book.theme, ownChapters, questions, titleOf);
  const sectionHref = (id: string | null) => sectionLink(book.id, id);
  const next = questions.find((q) => !q.answer.trim()) ?? null;
  const nextChapter = next ? chapters.find((ch) => ch.key === next.chapter) : null;
  // Свой вопрос и раздел своей книги — как их написал автор; пустая подсказка раздела — его заголовок.
  const nextTexts = next ? questionTexts(next, book) : null;
  const nextLabel = next && nextTexts ? sectionLabel({ prompt: nextTexts.prompt, defaultTitle: nextTexts.title, displayText: next.displayText, hideHeading: next.hideHeading }, kind, m.books.untitledSection) : "";
  // Крупная кнопка на хабе: что делать дальше.
  const cta =
    blank && chapters.length === 0
      ? { href: `${base}/questions`, eyebrow: t.createFirstChapter, label: t.createFirstChapterText }
      : next
        ? { href: sectionHref(next.id), eyebrow: `${blank || stats.answered ? (blank ? t.continueWriting : t.nextQuestion) : t.firstQuestion}${nextChapter ? ` · ${nextChapter.title}` : ""}`, label: nextLabel }
        : blank
          ? { href: sectionHref(questions[0]?.id ?? null), eyebrow: t.continueWriting, label: t.openEditor }
          : null;

  const steps = [
    { icon: PenLine, title: t.steps.text, value: blank ? t.blankStats(stats.total, stats.words) : c.count.answers(stats.answered), done: progressOf(kind, stats).textStepDone, href: `${base}/questions` },
    { icon: Palette, title: t.steps.cover, value: coverName(book.coverTemplate, locale), done: true, href: `${base}/cover` },
    { icon: BookOpenText, title: t.steps.pages, value: interiorName(book.interior, locale), done: true, href: `${base}/pages` },
    { icon: Camera, title: t.steps.photos, value: photos.length ? c.count.photos(photos.length) : t.steps.photosNone, done: photos.length > 0, href: `${base}/photos` },
    {
      icon: Mail,
      title: t.steps.letters,
      value: t.steps.lettersState(letterStats.approved, letterStats.pending, !!book.inviteToken),
      done: letterStats.approved > 0,
      href: `${base}/letters`,
    },
    { icon: SlidersHorizontal, title: t.steps.settings, value: `${getFormat(book.format).short} · ${localeMeta[book.language].label}`, done: true, href: `${base}/settings` },
    { icon: Eye, title: t.steps.preview, value: t.steps.previewValue, done: false, href: `${base}/preview` },
    {
      icon: Truck,
      title: t.steps.order,
      value: order ? orderStatusLabel(order.status, locale, isPrintedPlan(order.plan)) : t.steps.orderLater,
      done: !!order && isPaid(order.status),
      href: order ? `/orders/${order.id}` : `${base}/checkout`,
    },
  ];

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      {agreement ? <div className="mb-8"><AgreementCard agreement={agreement} books={[{ id: book.id, status: book.status, theme: book.theme, answered: stats.answered, total: stats.total, words: stats.words }]} /></div> : null}
      {/* Книга */}
      <section className="grid items-center gap-10 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:gap-16">
        <div className="mx-auto w-full max-w-[260px] lg:max-w-[300px]">
          <Morph name={`cover-${book.id}`}>
          <Book3D
            template={book.coverTemplate}
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
        <div>
          <div className="eyebrow">{editable ? t.writing : t.inWork}</div>
          <h1 className="mt-3 font-serif text-4xl leading-[1.05] font-medium sm:text-6xl">{book.title}</h1>
          {book.subtitle ? <p className="mt-2 font-serif text-xl text-muted italic">{book.subtitle}</p> : null}

          <dl className="mt-8 grid max-w-xl grid-cols-4 divide-x divide-line">
            {(
              [
                [printedPages, c.word.pages(printedPages), !built],
                blank ? [stats.total, t.sectionsWord(stats.total)] : [stats.answered, c.word.answers(stats.answered)],
                [stats.words, c.word.words(stats.words)],
                [stats.photos, c.word.photos()],
              ] as [number, string, boolean?][]
            ).map(([v, l, approx], i) => (
              <div key={i} className={cn("px-4 first:pl-0")}>
                <dt className="sr-only">{l}</dt>
                <dd className="font-serif text-3xl font-medium tabular-nums sm:text-4xl">
                  {approx ? <span className="text-muted">≈</span> : null}
                  {v.toLocaleString("ru-RU")}
                </dd>
                <div className="text-xs text-muted sm:text-sm">{l}</div>
              </div>
            ))}
          </dl>

          <div className="mt-6 max-w-xl">
            <div className="flex justify-between text-xs text-muted">
              <span>{blank ? t.blankPercent(percent) : t.percent(percent)}</span>
              {contentPages < print.minPages ? <span>{t.minPages(print.minPages)}</span> : null}
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-cream">
              <div className="bar-grow h-full rounded-full bg-wine" style={{ width: `${Math.max(percent, 1.5)}%` }} />
            </div>
          </div>

          {editable ? <DeadlineBanner bookId={book.id} occasion={book.occasion} occasionDate={book.occasionDate} answered={stats.answered} /> : null}

          {editable && cta ? (
            <Link href={cta.href} className="group mt-8 flex max-w-xl items-center gap-5 rounded-3xl bg-ink p-5 text-white transition hover:bg-ink-soft sm:p-6">
              <div className="min-w-0 flex-1">
                <div className="text-xs text-white/50">{cta.eyebrow}</div>
                <div className="mt-1.5 line-clamp-2 font-serif text-xl leading-snug sm:text-2xl">{cta.label}</div>
              </div>
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white text-ink transition group-hover:translate-x-1">
                <ArrowRight className="size-5" />
              </span>
            </Link>
          ) : null}
          {!editable ? (
            <p className="mt-8 max-w-xl rounded-2xl bg-cream/70 p-4 text-sm text-ink-soft">
              {t.locked}
            </p>
          ) : null}
        </div>
      </section>

      <section className="mt-16 grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {/* Главы */}
        <div>
          <div className="flex items-baseline justify-between">
            <h2 className="font-serif text-3xl font-medium">{t.chapters}</h2>
            <span className="text-sm text-muted">
              {t.chaptersStarted(chapters.filter((ch) => ch.answered > 0).length, chapters.length)}
            </span>
          </div>
          {chapters.length === 0 ? (
            blank ? <p className="mt-5 rounded-2xl border border-dashed border-line p-5 text-sm text-muted">{t.createFirstChapterText}</p> : null
          ) : (
            <ol className="mt-5 divide-y divide-line border-y border-line">
              {chapters.map((ch, i) => {
                const done = ch.total > 0 && ch.answered === ch.total;
                const href = ch.firstOpenId ?? ch.firstId;
                return (
                  <li key={ch.key}>
                    <Link href={sectionHref(href)} className="group flex items-center gap-4 py-3.5">
                      <span
                        className={cn(
                          "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular-nums",
                          done ? "bg-wine text-white" : ch.answered ? "bg-rose text-wine" : "bg-cream text-muted",
                        )}
                      >
                        {done ? <Check className="size-4" /> : i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium group-hover:text-wine" lang={book.language}>{ch.title}</span>
                        <span className="mt-1.5 block h-1 max-w-56 overflow-hidden rounded-full bg-cream">
                          <span className="block h-full rounded-full bg-wine/70" style={{ width: `${ch.total ? (ch.answered / ch.total) * 100 : 0}%` }} />
                        </span>
                      </span>
                      <span className="text-sm text-muted tabular-nums">{ch.total ? t.chapterSections(ch.answered, ch.total) : t.chapterEmpty}</span>
                      <ArrowRight className="size-4 text-muted opacity-0 transition group-hover:opacity-100" />
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {/* Путь к книге */}
        <aside className="space-y-6">
          <div className="card p-6">
            <h2 className="font-semibold">{t.path}</h2>
            <ol className="relative mt-5 space-y-1">
              {steps.map((s) => (
                <li key={s.title}>
                  <Link href={s.href} className="flex items-center gap-3 rounded-2xl px-2 py-2.5 transition hover:bg-cream/60">
                    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", s.done ? "bg-emerald-50 text-emerald-700" : "bg-cream text-ink-soft")}>
                      {s.done ? <Check className="size-4" /> : <s.icon className="size-4" strokeWidth={1.8} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{s.title}</span>
                      <span className="block truncate text-xs text-muted">{s.value}</span>
                    </span>
                    <ArrowRight className="size-4 text-muted" />
                  </Link>
                </li>
              ))}
            </ol>
          </div>

          {photos.length ? (
            <Link href={`${base}/photos`} className="card block overflow-hidden">
              <div className="grid grid-cols-4 gap-0.5">
                {photos.slice(0, 8).map((p) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={p.id} src={photoUrl(p.id)} alt="" className="aspect-square w-full object-cover" />
                ))}
              </div>
              <div className="px-5 py-3 text-sm text-muted">{t.photosManage(photos.length)}</div>
            </Link>
          ) : null}

          <div className="flex items-center justify-between gap-3 rounded-3xl border border-line p-5">
            <a href={site.contacts.whatsapp} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-sm">
              <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <MessageCircle className="size-4" />
              </span>
              <span>
                <span className="block font-medium">{t.help}</span>
                <span className="text-muted">{t.helpText}</span>
              </span>
            </a>
            <BookMenu bookId={book.id} editable={editable} />
          </div>
        </aside>
      </section>
    </main>
  );
}
