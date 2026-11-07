import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { BookOpenText, Camera, Check, ChevronDown, Eye, Mail, MessageCircle, Palette, PenLine, SlidersHorizontal, Truck } from "lucide-react";
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

  const textDone = progressOf(kind, stats).textStepDone;
  const paid = !!order && isPaid(order.status);
  type Step = { icon: typeof PenLine; title: string; value: string; done: boolean; href: string };
  // Путь к книге — три этапа в порядке вкладок: написать, оформить (уже выбрано по умолчанию), проверить и заказать.
  const stages: { key: "write" | "design" | "finish"; done: boolean; steps: Step[] }[] = [
    {
      key: "write",
      done: textDone,
      steps: [
        { icon: PenLine, title: t.steps.text, value: blank ? t.blankStats(stats.total, stats.words) : c.count.answers(stats.answered), done: textDone, href: `${base}/questions` },
        { icon: Camera, title: t.steps.photos, value: photos.length ? c.count.photos(photos.length) : t.steps.photosNone, done: photos.length > 0, href: `${base}/photos` },
        { icon: Mail, title: t.steps.letters, value: t.steps.lettersState(letterStats.approved, letterStats.pending, !!book.inviteToken), done: letterStats.approved > 0, href: `${base}/letters` },
      ],
    },
    {
      key: "design",
      done: true,
      steps: [
        { icon: Palette, title: t.steps.cover, value: coverName(book.coverTemplate, locale), done: true, href: `${base}/cover` },
        { icon: BookOpenText, title: t.steps.pages, value: interiorName(book.interior, locale), done: true, href: `${base}/pages` },
        { icon: SlidersHorizontal, title: t.steps.settings, value: `${getFormat(book.format).short}, ${localeMeta[book.language].label}`, done: true, href: `${base}/settings` },
      ],
    },
    {
      key: "finish",
      done: paid,
      steps: [
        { icon: Eye, title: t.steps.preview, value: t.steps.previewValue, done: !!order, href: `${base}/preview` },
        { icon: Truck, title: t.steps.order, value: order ? orderStatusLabel(order.status, locale, isPrintedPlan(order.plan)) : t.steps.orderLater, done: paid, href: order ? `/orders/${order.id}` : `${base}/checkout` },
      ],
    },
  ];
  const current = stages.findIndex((st) => !st.done);
  // Главы: первые шесть на виду, остальные — под «Все главы»; длинный список больше не растягивает страницу.
  const shownChapters = chapters.slice(0, 6);
  const moreChapters = chapters.slice(6);
  const chapterRow = (ch: (typeof chapters)[number], i: number) => {
    const done = ch.total > 0 && ch.answered === ch.total;
    const href = ch.firstOpenId ?? ch.firstId;
    return (
      <li key={ch.key}>
        <Link href={sectionHref(href)} className="group flex min-h-12 items-center gap-3 rounded-[10px] px-2 py-2 hover:bg-sunken/70">
          <span
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular-nums",
              done ? "bg-wine text-white" : ch.answered ? "bg-rose text-wine" : "border border-line text-muted",
            )}
          >
            {done ? <Check className="size-3.5" aria-label={t.chapterSections(ch.answered, ch.total)} /> : i + 1}
          </span>
          <span className="min-w-0 flex-1 truncate text-[15px] group-hover:text-wine" lang={book.language}>
            {ch.title}
          </span>
          <span className="shrink-0 text-xs text-muted tabular-nums">{ch.total ? t.chapterSections(ch.answered, ch.total) : t.chapterEmpty}</span>
        </Link>
      </li>
    );
  };
  const facts: [number, string, boolean?][] = [
    [printedPages, c.word.pages(printedPages), !built],
    blank ? [stats.total, t.sectionsWord(stats.total)] : [stats.answered, c.word.answers(stats.answered)],
    [stats.words, c.word.words(stats.words)],
    [stats.photos, c.word.photos()],
  ];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      {agreement ? (
        <div className="mb-8">
          <AgreementCard agreement={agreement} books={[{ id: book.id, status: book.status, theme: book.theme, answered: stats.answered, total: stats.total, words: stats.words }]} />
        </div>
      ) : null}

      {/* Книга: сама книга, название, сколько написано и что делать дальше */}
      <section className="grid items-center gap-8 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)] md:gap-12 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:gap-16">
        <div className="mx-auto w-full max-w-[150px] md:max-w-[260px] lg:max-w-[300px]">
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
        <div className="min-w-0">
          <h1 className="font-serif text-4xl leading-[1.05] font-medium text-balance sm:text-6xl">{book.title}</h1>
          {book.subtitle ? <p className="mt-2 font-serif text-xl text-muted italic">{book.subtitle}</p> : null}

          <dl className="mt-5 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted" aria-label={t.stats}>
            {facts.map(([v, l, approx], i) => (
              <div key={i} className="flex items-baseline gap-1.5">
                <dt className="sr-only">{l}</dt>
                <dd className="font-medium text-ink tabular-nums">
                  {approx ? "≈" : ""}
                  {v.toLocaleString("ru-RU")}
                </dd>
                <span aria-hidden>{l}</span>
              </div>
            ))}
          </dl>

          <div className="mt-4 max-w-xl">
            <div className="h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={blank ? t.blankPercent(percent) : t.percent(percent)}>
              <div className="bar-grow h-full rounded-full bg-wine" style={{ width: `${Math.max(percent, 1.5)}%` }} />
            </div>
            <div className="mt-1.5 flex flex-wrap justify-between gap-x-4 text-xs text-muted">
              <span>{blank ? t.blankPercent(percent) : t.percent(percent)}</span>
              {contentPages < print.minPages ? <span>{t.minPages(print.minPages)}</span> : null}
            </div>
          </div>

          {editable && cta ? (
            // Следующий шаг — лист с вопросом, набранным как в книге, и одна главная кнопка.
            <div className="mt-7 max-w-xl rounded-[14px] border border-line bg-white p-5 sm:p-6">
              <div className="text-xs text-muted">{cta.eyebrow}</div>
              <Link href={cta.href} className="mt-2 line-clamp-3 font-serif text-[22px] leading-snug text-ink hover:text-wine sm:text-2xl" lang={book.language}>
                {cta.label}
              </Link>
              <Link href={cta.href} className="btn btn-primary mt-5 max-sm:w-full">
                <PenLine className="size-4" aria-hidden /> {next && !blank ? t.answerCta : t.writeCta}
              </Link>
            </div>
          ) : null}
          {editable ? (
            <div className="max-w-xl">
              <DeadlineBanner bookId={book.id} occasion={book.occasion} occasionDate={book.occasionDate} answered={stats.answered} />
            </div>
          ) : (
            <p className="mt-7 max-w-xl rounded-[14px] bg-sunken p-4 text-sm leading-relaxed text-ink-soft">{t.locked}</p>
          )}
        </div>
      </section>

      {/* Путь к готовой книге: три этапа, как группы вкладок */}
      <section className="mt-14 sm:mt-20" aria-labelledby="book-path">
        <h2 id="book-path" className="font-serif text-3xl font-medium">
          {t.path}
        </h2>
        <ol className="mt-5 grid overflow-hidden rounded-[14px] border border-line bg-white md:grid-cols-3">
          {stages.map((st, i) => (
            <li key={st.key} className={cn("p-4 sm:p-5", i > 0 && "border-line max-md:border-t md:border-l")}>
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
                    st.done ? "bg-success-bg text-success" : i === current ? "bg-wine text-white" : "border border-line-strong text-muted",
                  )}
                >
                  {st.done ? <Check className="size-3.5" aria-hidden /> : i + 1}
                </span>
                <div className="min-w-0">
                  <h3 className={cn("text-[15px] font-semibold", i !== current && !st.done && "text-ink-soft")}>{t.stages[st.key]}</h3>
                  <p className="text-xs text-muted">{t.stageHint[st.key]}</p>
                </div>
              </div>
              <ul className="mt-3 -mx-2 space-y-0.5">
                {st.steps.map((s) => (
                  <li key={s.title}>
                    <Link href={s.href} className="group flex min-h-12 items-center gap-3 rounded-[10px] px-2 py-1.5 hover:bg-sunken/70">
                      <s.icon className={cn("size-4 shrink-0", s.done ? "text-success" : "text-muted")} strokeWidth={1.8} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium group-hover:text-wine">{s.title}</span>
                        <span className="block truncate text-xs text-muted">{s.value}</span>
                      </span>
                      {s.done ? <Check className="size-4 shrink-0 text-success" aria-hidden /> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-10">
        {/* Главы — компактно: первые шесть, остальные по кнопке */}
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-serif text-3xl font-medium">{t.chapters}</h2>
            {chapters.length ? <span className="text-sm text-muted">{t.chaptersStarted(chapters.filter((ch) => ch.answered > 0).length, chapters.length)}</span> : null}
          </div>
          {chapters.length === 0 ? (
            blank ? <p className="mt-5 rounded-[14px] border border-dashed border-line-strong p-5 text-sm text-muted">{t.createFirstChapterText}</p> : null
          ) : (
            <div className="mt-4 -mx-2">
              <ol className="grid gap-x-6 sm:grid-cols-2">{shownChapters.map((ch, i) => chapterRow(ch, i))}</ol>
              {moreChapters.length ? (
                <details className="group/more">
                  <summary className="mx-2 mt-2 inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-wine hover:underline [&::-webkit-details-marker]:hidden">
                    <ChevronDown className="size-4 transition group-open/more:rotate-180" aria-hidden /> {t.allChapters(chapters.length)}
                  </summary>
                  <ol className="grid gap-x-6 sm:grid-cols-2" start={7}>
                    {moreChapters.map((ch, i) => chapterRow(ch, i + 6))}
                  </ol>
                </details>
              ) : null}
            </div>
          )}
        </div>

        <aside className="space-y-4">
          {photos.length ? (
            <Link href={`${base}/photos`} className="block overflow-hidden rounded-[14px] border border-line bg-white hover:border-line-strong">
              <div className="grid grid-cols-4 gap-0.5">
                {photos.slice(0, 8).map((p) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={p.id} src={photoUrl(p.id)} alt="" className="aspect-square w-full object-cover" />
                ))}
              </div>
              <div className="px-4 py-3 text-sm text-muted">{t.photosManage(photos.length)}</div>
            </Link>
          ) : null}

          <div className="flex items-center justify-between gap-3 rounded-[14px] border border-line bg-white p-4">
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
      </section>
    </main>
  );
}
