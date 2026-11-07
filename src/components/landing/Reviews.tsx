import { Star } from "lucide-react";
import type { Messages } from "@/i18n/messages";
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
    <span className="inline-flex shrink-0 gap-0.5 text-amber-400" aria-hidden>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn(className, n <= Math.round(value) ? "fill-current" : "text-line")} strokeWidth={1.5} />
      ))}
    </span>
  );
}

/**
 * Отзывы покупателей на лендинге и страницах книг: сводная оценка (когда отзывов достаточно,
 * чтобы она что-то значила) и карточки «стеной» — с фото вручения, если автор его приложил.
 */
export function Reviews({
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
  return (
    <section id="reviews" className={cn("scroll-mt-16 py-20 sm:py-28", className)}>
      <div className="container-x">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-12">
          <h2 className="max-w-2xl font-serif text-4xl leading-[1.05] font-medium tracking-tight text-balance sm:text-5xl">{t.title}</h2>
          {summary ? (
            <div className="flex items-center gap-3 md:pb-1.5">
              <Stars value={summary.average} className="size-5" />
              <span className="text-sm font-medium tabular-nums">{t.summary(summary.average.toFixed(1).replace(".", ","), summary.count)}</span>
            </div>
          ) : null}
        </div>
        {/* Три и больше — «стена» колонками; один-два — в ряд слева, без растягивания на всю ширину. */}
        <div className={cn("mt-12", reviews.length >= 3 ? "columns-1 gap-10 sm:columns-2 lg:columns-3" : "grid max-w-4xl items-start gap-10 sm:grid-cols-2")}>
          {reviews.map((r, i) => (
            // На телефоне — три лучших: лента отзывов не должна отодвигать цены и FAQ.
            <figure key={r.id} className={cn("break-inside-avoid border-t border-line pt-6", reviews.length >= 3 && "mb-10", i >= 3 && "max-sm:hidden")}>
              {r.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/reviews/photo/${r.id}`}
                  alt={t.photoAlt(r.authorName)}
                  width={r.photo.width}
                  height={r.photo.height}
                  loading="lazy"
                  decoding="async"
                  className="mb-6 max-h-80 w-full rounded-[3px] object-cover shadow-book"
                  style={{ aspectRatio: `${r.photo.width} / ${r.photo.height}` }}
                />
              ) : null}
              <Stars value={r.rating} />
              <span className="sr-only">{r.rating}/5</span>
              <blockquote className="mt-4 font-serif text-[22px] leading-snug whitespace-pre-line">«{r.text.trim()}»</blockquote>
              <figcaption className="mt-5 text-sm text-muted">
                <span className="font-medium text-ink">{r.authorName}</span>
                {r.city ? `, ${r.city}` : ""}
                {t.theme[r.theme] ? <span className="block">{t.theme[r.theme]}</span> : null}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
