import { Star } from "lucide-react";
import type { Messages } from "@/i18n/messages";
import { cn } from "@/lib/utils";

/** Отзыв на витрине: только то, что автор разрешил показать. */
export interface ShowcaseReview {
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
    <section id="reviews" className={cn("scroll-mt-20 bg-rose/40 py-20 sm:py-28", className)}>
      <div className="container-x">
        <div className="mx-auto max-w-2xl text-center">
          <div className="eyebrow">{t.eyebrow}</div>
          <h2 className="mt-3 font-serif text-4xl font-medium tracking-tight sm:text-5xl">{t.title}</h2>
          {summary ? (
            <div className="mt-5 inline-flex items-center gap-3 rounded-full bg-white/80 px-5 py-2 shadow-soft">
              <Stars value={summary.average} className="size-5" />
              <span className="text-sm font-medium tabular-nums">{t.summary(summary.average.toFixed(1).replace(".", ","), summary.count)}</span>
            </div>
          ) : null}
        </div>
        {/* Три и больше — «стена» колонками; один-два отзыва — по центру, чтобы не висели у края. */}
        <div
          className={cn(
            "reveal-stagger mt-12",
            reviews.length >= 3 ? "columns-1 gap-5 sm:columns-2 lg:columns-3" : reviews.length === 2 ? "mx-auto grid max-w-4xl items-start gap-5 sm:grid-cols-2" : "mx-auto max-w-md",
          )}
        >
          {reviews.map((r, i) => (
            // На телефоне — три лучших: лента карточек не должна отодвигать цены и FAQ.
            <figure key={r.id} className={cn("card break-inside-avoid overflow-hidden", reviews.length >= 3 && "mb-5", i >= 3 && "max-sm:hidden")}>
              {r.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/reviews/photo/${r.id}`}
                  alt=""
                  width={r.photo.width}
                  height={r.photo.height}
                  loading="lazy"
                  decoding="async"
                  className="max-h-80 w-full object-cover"
                  style={{ aspectRatio: `${r.photo.width} / ${r.photo.height}` }}
                />
              ) : null}
              <div className="p-7">
                <Stars value={r.rating} />
                <span className="sr-only">{r.rating}/5</span>
                <blockquote className="mt-4 font-serif text-xl leading-snug whitespace-pre-line">«{r.text.trim()}»</blockquote>
                <figcaption className="mt-5 text-sm text-muted">
                  <span className="font-medium text-ink">{r.authorName}</span>
                  {r.city ? `, ${r.city}` : ""}
                  {t.theme[r.theme] ? ` · ${t.theme[r.theme]}` : ""}
                </figcaption>
              </div>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
