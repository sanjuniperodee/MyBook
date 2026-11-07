import { Check } from "lucide-react";
import { Link } from "@/i18n/client";
import { CoverPreview } from "@/components/cover/CoverPreview";
import { coverPhotoUrl } from "@/lib/book/photo-cover";
import { applyGender } from "@/lib/content/gender";
import { chapterTitle, countQuestions, getTheme } from "@/lib/content/themes";
import { productionDays } from "@/config/site";
import { coverName } from "@/i18n/labels";
import { getLocale, getMessages } from "@/i18n/server";
import { cn } from "@/lib/class-names";

/**
 * «Как это работает» — один сквозной путь: линия слева, на ней четыре шага разной высоты, и у каждого — живой макет того,
 * что человек увидит: выбор книги, редактор с ответом и страницей рядом, фото и обложки, готовая книга. Слева на
 * широком экране — заголовок и главная кнопка, они остаются на месте, пока идёт путь. Сроки — из словаря (`when`).
 */

/** Страница книги в макете: лист с рамкой, не зависит от оформления — только токены, поэтому следует теме витрины. */
const sheet = "border border-line bg-white text-ink";

/** Серые строки-«текст» на уменьшенной странице. */
function Lines({ n, className }: { n: number; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)} aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className={cn("h-1 rounded-full bg-line-strong/70", i === n - 1 && "w-2/3")} />
      ))}
    </div>
  );
}

export async function HowPath({ cta, ctaLabel, className }: { cta: string; ctaLabel: string; className?: string }) {
  const [locale, m] = await Promise.all([getLocale(), getMessages()]);
  const t = m.landing;
  const love = getTheme("love", locale);
  const steps = t.how.steps(countQuestions(love));
  const when = t.how.when(productionDays.standard);
  const g = (s: string) => applyGender(s, "f", "m");
  const dateChapter = love.chapters.find((ch) => ch.key === "date");
  const question = dateChapter?.questions[7];
  const picks = [love, getTheme("mom", locale), getTheme("dad", locale), getTheme("autobiography", locale)];
  const covers = ["peony", "lavender", "alatau"].filter((id) => t.coverSamples[id]);

  const mock: React.ReactNode[] = [
    // 1. Выбор книги: четыре обложки на полке, первая выбрана
    <ul key="choose" className="flex items-end gap-2.5 sm:gap-5">
      {picks.map((th, i) => (
        <li key={th.id} className="w-[22%] max-w-[120px]">
          <div className={cn("rounded-[3px]", i === 0 && "ring-2 ring-wine ring-offset-2 ring-offset-cream")}>
            <CoverPreview template={th.defaultCover} title={th.titleSuggestions[0]} names={t.coverSamples[th.defaultCover]?.names} lite className="rounded-[3px] shadow-book" />
          </div>
          <div className={cn("mt-2 text-xs leading-tight sm:text-[13px]", i === 0 ? "font-medium text-ink" : "text-muted")}>{th.name}</div>
        </li>
      ))}
    </ul>,

    // 2. Редактор и страница книги рядом: что пишете слева — то получается справа
    <div key="write" className="relative grid gap-0 sm:grid-cols-[minmax(0,1.05fr)_minmax(0,0.8fr)]">
      <div className="rounded-(--r-panel) border border-line bg-white p-5 sm:p-6 sm:pr-24">
        <div className="flex items-center justify-between gap-3 text-xs text-muted">
          <span className="truncate">{chapterTitle(love, "date", locale)}</span>
          <span className="inline-flex shrink-0 items-center gap-1 text-success">
            <Check className="size-3.5" strokeWidth={2} aria-hidden /> {m.common.actions.saved}
          </span>
        </div>
        {question ? <p className="mt-4 font-serif text-[21px] leading-snug font-medium">{g(question[0])}</p> : null}
        <p className="mt-4 rounded-(--r-ctl) border border-line-strong bg-paper px-4 py-3 text-[15px] leading-relaxed text-ink-soft">
          {t.sample.p1}
          <span aria-hidden className="ml-px inline-block h-[1em] w-px translate-y-[0.15em] bg-ink/60" />
        </p>
      </div>
      <div className={cn("relative z-10 -mt-3 ml-6 rotate-[1.2deg] rounded-[3px] px-[9%] pt-[9%] pb-[10%] shadow-book sm:mt-6 sm:-ml-20 sm:self-start", sheet)}>
        <div className="font-serif text-[22px] leading-tight font-medium">{t.sample.h1}</div>
        <p className="mt-3 font-serif text-[15px] leading-[1.5] text-ink-soft">
          <span className="float-left mt-[0.06em] mr-1.5 font-serif text-[3.1em] leading-[0.78] text-wine">{t.sample.p1.slice(0, 1)}</span>
          {t.sample.p1.slice(1)}
        </p>
        <div className="mt-5 text-center font-serif text-sm text-muted tabular-nums">7</div>
      </div>
    </div>,

    // 3. Фото на странице и выбор обложки
    <div key="photos" className="grid items-end gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] sm:gap-10">
      <div className={cn("mx-auto w-full max-w-[19rem] rounded-[3px] p-[8%] shadow-book sm:mx-0", sheet)}>
        <Lines n={3} />
        <figure className="mx-auto my-4 -rotate-[1.5deg] border border-line bg-white p-2 pb-0 shadow-soft">
          {/* eslint-disable-next-line @next/next/no-img-element -- готовые уменьшенные копии из /api/cover-photos */}
          <img src={coverPhotoUrl("couple", 900)} alt="" loading="lazy" decoding="async" className="aspect-[4/3] w-full object-cover object-[60%_30%]" />
          <figcaption className="py-2 text-center font-hand text-[17px] text-ink-soft">{t.sample.caption}</figcaption>
        </figure>
        <Lines n={3} />
      </div>
      <ul className="flex items-end gap-3">
        {covers.map((id, i) => (
          <li key={id} className="w-[31%]">
            <div className={cn("rounded-[3px]", i === 0 && "ring-2 ring-wine ring-offset-2 ring-offset-cream")}>
              <CoverPreview template={id} title={t.coverSamples[id].title} names={t.coverSamples[id].names} lite className="rounded-[3px] shadow-book" />
            </div>
            <div className={cn("mt-2 text-xs leading-tight", i === 0 ? "font-medium text-ink" : "text-muted")}>{coverName(id, locale)}</div>
          </li>
        ))}
      </ul>
    </div>,

    // 4. Готовая книга и точный макет страниц
    <div key="book" className="flex items-end gap-5 sm:gap-8">
      <div className="w-[34%] max-w-[150px] shrink-0">
        <CoverPreview template="peony" title={t.coverSamples.peony.title} names={t.coverSamples.peony.names} lite className="rounded-[3px] shadow-book" />
      </div>
      <div className="flex min-w-0 items-end gap-2.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className={cn("aspect-[148/210] w-[26%] min-w-14 max-w-[84px] rounded-[2px] p-2", sheet)} style={{ transform: `translateY(${i * -6}px)` }}>
            <div className="h-1.5 w-1/2 rounded-full bg-ink/50" />
            <Lines n={6} className="mt-2.5" />
          </div>
        ))}
      </div>
    </div>,
  ];

  return (
    <section id="how" className={cn("below-fold scroll-mt-16 border-t border-line bg-cream/60 py-20 sm:py-28", className)}>
      <div className="container-x grid gap-x-20 gap-y-12 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.5fr)]">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <h2 className="max-w-md font-serif text-[34px] leading-[1.05] font-medium tracking-tight text-balance sm:text-5xl">{t.how.title}</h2>
          <Link href={cta} data-main-cta="" className="btn btn-primary btn-lg mt-8 max-lg:hidden">
            {ctaLabel}
          </Link>
        </div>

        <ol className="relative pl-12 sm:pl-16">
          {/* Сквозная линия пути */}
          <span aria-hidden className="absolute top-3 bottom-3 left-[15px] w-px bg-line-strong sm:left-[19px]" />
          {steps.map((step, i) => (
            <li key={step.title} className={cn("relative pb-14 last:pb-0 sm:pb-16", i === 3 && "sm:pb-0")}>
              <span aria-hidden className="absolute top-0.5 -left-12 flex size-8 items-center justify-center rounded-full bg-wine font-serif text-[17px] leading-none text-white tabular-nums sm:-left-16 sm:size-10 sm:text-xl">
                {i + 1}
              </span>
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <h3 className="font-serif text-[26px] leading-tight font-medium sm:text-[32px]">{step.title}</h3>
                <span className="text-sm text-muted">{when[i]}</span>
              </div>
              <p className="mt-3 max-w-xl leading-relaxed text-ink-soft">{step.text}</p>
              <div className="mt-7">{mock[i]}</div>
            </li>
          ))}
        </ol>

        <div className="lg:hidden">
          <Link href={cta} data-main-cta="" className="btn btn-primary btn-lg w-full sm:w-auto">
            {ctaLabel}
          </Link>
        </div>
      </div>
    </section>
  );
}
