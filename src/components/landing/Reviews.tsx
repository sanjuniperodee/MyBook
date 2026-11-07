import { Star } from "lucide-react";
import { CoverPreview } from "@/components/cover/CoverPreview";
import type { Messages } from "@/i18n/messages";
import { getLocale } from "@/i18n/server";
import { getTheme, isThemeId } from "@/lib/content/themes";
import { cn } from "@/lib/class-names";

/** Отзыв на витрине: только то, что автор разрешил показать. */
interface ShowcaseReview {
  id: string;
  rating: number;
  text: string;
  authorName: string;
  city: string;
  theme: string;
  photo: { width: number; height: number } | null;
}

/** Пять звёзд; дробная оценка округляется до целой звезды. */
export function Stars({ value, className = "size-4" }: { value: number; className?: string }) {
  return (
    <span className="inline-flex shrink-0 gap-0.5 text-gold" aria-hidden>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn(className, n <= Math.round(value) ? "fill-current" : "text-line-strong")} strokeWidth={1.5} />
      ))}
    </span>
  );
}

/** Размер цитаты по её длине: короткая — крупно, как эпиграф; длинная — как абзац. */
const quoteSize = (text: string, lead: boolean) => {
  const n = text.trim().length;
  if (lead) return n < 160 ? "text-[30px] leading-[1.18] sm:text-[44px]" : n < 340 ? "text-[26px] leading-[1.22] sm:text-[34px]" : "text-[22px] leading-[1.3] sm:text-[28px]";
  return n < 200 ? "text-[24px] leading-[1.25] sm:text-[28px]" : "text-[20px] leading-[1.35] sm:text-[23px]";
};

function Photo({ r, t, className }: { r: ShowcaseReview; t: Messages["review"]["showcase"]; className?: string }) {
  if (!r.photo) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/reviews/photo/${r.id}`}
      alt={t.photoAlt(r.authorName)}
      width={r.photo.width}
      height={r.photo.height}
      loading="lazy"
      decoding="async"
      className={cn("w-full rounded-[3px] object-cover shadow-book", className)}
      style={{ aspectRatio: `${r.photo.width} / ${r.photo.height}` }}
    />
  );
}

function Byline({ r, t }: { r: ShowcaseReview; t: Messages["review"]["showcase"] }) {
  return (
    <figcaption className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
      <Stars value={r.rating} className="size-3.5" />
      <span className="sr-only">{r.rating}/5</span>
      <span>
        <span className="font-medium text-ink">{r.authorName}</span>
        {r.city ? `, ${r.city}` : ""}
        {t.theme[r.theme] ? <span className="block text-muted/80 sm:ml-2.5 sm:inline">{t.theme[r.theme]}</span> : null}
      </span>
    </figcaption>
  );
}

/**
 * Отзывы покупателей на лендинге и страницах книг. Первый — крупной цитатой, рядом с фото вручения, если автор его
 * приложил; остальные — цитатами поменьше в две колонки, разной высоты (фото — над текстом). Сводная оценка — в шапке
 * блока, когда отзывов достаточно, чтобы она что-то значила.
 */
export async function Reviews({
  reviews,
  summary,
  t,
  className,
}: {
  reviews: ShowcaseReview[];
  /** Сводная оценка — null, пока отзывов мало. */
  summary: { average: number; count: number } | null;
  t: Messages["review"]["showcase"];
  className?: string;
}) {
  if (!reviews.length) return null;
  const [lead, ...rest] = reviews;
  // Нет фото вручения — рядом с цитатой обложка книги по теме отзыва: цитата всегда стоит рядом с книгой.
  const locale = await getLocale();
  const leadTheme = !lead.photo && isThemeId(lead.theme) ? getTheme(lead.theme, locale) : null;
  return (
    <section id="reviews" className={cn("scroll-mt-16 py-20 sm:py-28", className)}>
      <div className="container-x">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-10">
          <h2 className="max-w-2xl font-serif text-[34px] leading-[1.05] font-medium tracking-tight text-balance sm:text-5xl">{t.title}</h2>
          {summary ? (
            <div className="flex items-center gap-3 sm:pb-1.5">
              <Stars value={summary.average} className="size-5" />
              <span className="text-sm font-medium tabular-nums">{t.summary(summary.average.toFixed(1).replace(".", ","), summary.count)}</span>
            </div>
          ) : null}
        </div>

        <figure className={cn("mt-12 grid gap-10 sm:mt-16", lead.photo ? "lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)] lg:items-center lg:gap-16" : leadTheme ? "lg:grid-cols-[minmax(0,1.5fr)_minmax(0,15rem)] lg:items-center lg:gap-24" : "max-w-4xl")}>
          <div className="lg:order-1">
            <span aria-hidden className="block font-serif text-7xl leading-[0.6] text-wine/70 select-none sm:text-8xl">«</span>
            <blockquote className={cn("mt-2 font-serif font-medium whitespace-pre-line text-balance", quoteSize(lead.text, true))}>{lead.text.trim()}»</blockquote>
            <Byline r={lead} t={t} />
          </div>
          {lead.photo ? <Photo r={lead} t={t} className="max-h-[34rem] max-lg:-order-1 lg:order-2" /> : null}
          {leadTheme ? (
            <div aria-hidden className="w-40 rotate-[2deg] max-lg:-order-1 sm:w-48 lg:order-2 lg:w-full">
              <CoverPreview template={leadTheme.defaultCover} title={leadTheme.titleSuggestions[0]} lite className="rounded-[3px] shadow-book" />
            </div>
          ) : null}
        </figure>

        {rest.length ? (
          <div className="mt-16 border-t border-line pt-12 sm:mt-20 sm:pt-14 md:columns-2 md:gap-x-20">
            {rest.map((r, i) => (
              // На телефоне — три лучших: лента отзывов не должна отодвигать цены и FAQ.
              <figure key={r.id} className={cn("break-inside-avoid pb-12", i >= 2 && "max-sm:hidden")}>
                <Photo r={r} t={t} className="mb-6 max-h-72" />
                <blockquote className={cn("font-serif font-medium whitespace-pre-line", quoteSize(r.text, false))}>«{r.text.trim()}»</blockquote>
                <Byline r={r} t={t} />
              </figure>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
