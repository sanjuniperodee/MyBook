import Link from "next/link";
import { ImageIcon, Pin, Star } from "lucide-react";
import { container } from "@/server/container";
import { requireStaff } from "@/server/access";
import { PUBLIC_TEXT_MIN, LOW_RATING, type ReviewStatus, type StaffReview } from "@/modules/feedback";
import { messagesFor } from "@/i18n/messages";
import { cn, formatDate } from "@/lib/utils";
import { ReviewActions } from "./ReviewActions";

export const metadata = { title: "Отзывы" };

const themes = messagesFor("ru").review.showcase.theme;
const filters: { key: ReviewStatus | "all"; label: string }[] = [
  { key: "new", label: "Новые" },
  { key: "published", label: "На сайте" },
  { key: "hidden", label: "Скрытые" },
  { key: "all", label: "Все" },
];
const statusBadge: Record<ReviewStatus, [string, string]> = {
  new: ["Новый", "bg-amber-50 text-amber-800"],
  published: ["На сайте", "bg-emerald-50 text-emerald-700"],
  hidden: ["Скрыт", "bg-cream text-muted"],
};

export default async function AdminReviews({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  await requireStaff("reviews.manage");
  const { s } = await searchParams;
  const filter = filters.find((f) => f.key === s)?.key ?? "new";
  const feedback = container().feedback;
  const [list, counts, summary] = await Promise.all([feedback.queries.list(filter), feedback.queries.counts(), feedback.queries.summary()]);
  const total = (counts.new ?? 0) + (counts.published ?? 0) + (counts.hidden ?? 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Отзывы клиентов</h1>
          <p className="mt-1 text-sm text-muted">
            Ссылка на отзыв приходит в письме после доставки. На сайт попадает только то, что вы опубликуете, и только с согласия автора.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Средняя оценка", summary.count ? `${summary.average.toFixed(1)} ★` : "—"],
          ["Всего отзывов", String(total)],
          ["Ждут проверки", String(counts.new ?? 0)],
          ["На сайте", String(counts.published ?? 0)],
        ].map(([l, v]) => (
          <div key={l} className="rounded-2xl border border-line bg-white p-4">
            <div className="text-xs text-muted">{l}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{v}</div>
          </div>
        ))}
      </div>

      <nav className="flex flex-wrap gap-2 text-sm">
        {filters.map((f) => (
          <Link
            key={f.key}
            href={f.key === "new" ? "/admin/reviews" : `/admin/reviews?s=${f.key}`}
            className={cn("rounded-full border px-3.5 py-1.5 transition", f.key === filter ? "border-ink bg-ink text-white" : "border-line bg-white hover:bg-cream")}
          >
            {f.label}
            {f.key !== "all" && counts[f.key] ? <span className="ml-1.5 opacity-60 tabular-nums">{counts[f.key]}</span> : null}
          </Link>
        ))}
      </nav>

      {list.length ? (
        <ul className="grid gap-4 lg:grid-cols-2">
          {list.map((r) => (
            <ReviewCard key={r.id} r={r} />
          ))}
        </ul>
      ) : (
        <div className="rounded-2xl border border-dashed border-line bg-white p-10 text-center text-muted">
          {filter === "new" ? "Новых отзывов нет — всё проверено." : "Здесь пока пусто."}
        </div>
      )}
    </div>
  );
}

function ReviewCard({ r }: { r: StaffReview }) {
  const [label, tone] = statusBadge[r.status];
  const tooShort = r.text.trim().length < PUBLIC_TEXT_MIN;
  const blocker = !r.consent ? "Автор не разрешил показывать отзыв на сайте" : tooShort ? `Текст короче ${PUBLIC_TEXT_MIN} символов — на сайт не попадёт, но в средней оценке учтён` : null;
  return (
    <li className={cn("flex flex-col rounded-2xl border bg-white p-5", r.rating <= LOW_RATING ? "border-red-200" : "border-line")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex gap-0.5 text-amber-400" aria-label={`${r.rating} из 5`}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} className={cn("size-4", n <= r.rating ? "fill-current" : "text-line")} strokeWidth={1.5} />
          ))}
        </span>
        <span className={cn("rounded-full px-2 py-0.5 text-xs", tone)}>{label}</span>
        {r.featured ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose/60 px-2 py-0.5 text-xs text-wine">
            <Pin className="size-3" /> На главной первым
          </span>
        ) : null}
        <span className="ml-auto text-xs text-muted">{formatDate(r.createdAt, true)}</span>
      </div>

      <div className="mt-4 flex gap-4">
        {r.photo ? (
          <a href={`/api/reviews/photo/${r.id}`} target="_blank" rel="noreferrer" className="shrink-0" title="Открыть фото">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/reviews/photo/${r.id}`} alt="" className="size-24 rounded-xl object-cover ring-1 ring-line" loading="lazy" />
          </a>
        ) : null}
        <p className={cn("text-sm leading-relaxed whitespace-pre-line", r.text ? "text-ink" : "text-muted italic")}>{r.text || "Без текста — только оценка"}</p>
      </div>

      <div className="mt-4 text-sm">
        <b>{r.authorName}</b>
        {r.city ? `, ${r.city}` : ""} · <span className="text-muted">{themes[r.theme] ?? r.theme}</span>
        {r.locale === "kk" ? <span className="ml-1.5 rounded bg-cream px-1.5 py-0.5 text-[11px] text-muted">KK</span> : null}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
        <Link href={`/admin/orders/${r.orderId}`} className="text-wine hover:underline">
          Заказ №{r.orderNumber}
        </Link>
        <span>{r.email}</span>
        {r.thankYouCode ? <span className="font-mono">{r.thankYouCode}</span> : null}
        {r.photo ? (
          <span className="inline-flex items-center gap-1">
            <ImageIcon className="size-3" /> фото
          </span>
        ) : null}
      </div>

      {blocker ? <p className="mt-3 rounded-lg bg-cream px-3 py-2 text-xs text-ink-soft">{blocker}</p> : null}
      <div className="mt-auto pt-4">
        <ReviewActions id={r.id} status={r.status} featured={r.featured} publishable={!blocker} />
      </div>
    </li>
  );
}
