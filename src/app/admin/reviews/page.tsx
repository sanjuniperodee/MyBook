import Link from "next/link";
import { CircleCheck, ImageIcon, MessageSquareQuote, Pin, Star } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { Segmented } from "@/components/admin/Segmented";
import { StatRow, StatTile } from "@/components/admin/charts";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { container } from "@/server/container";
import { requireStaff } from "@/server/access";
import { PUBLIC_TEXT_MIN, LOW_RATING, type StaffReview } from "@/modules/feedback";
import type { ReviewStatus } from "@/shared/domain/reviews";
import { messagesFor } from "@/i18n/messages";
import { cn } from "@/lib/class-names";
import { formatDate } from "@/lib/dates";
import { ReviewActions } from "./ReviewActions";

export const metadata = { title: "Отзывы" };

const themes = messagesFor("ru").review.showcase.theme;
const filters: { key: ReviewStatus | "all"; label: string }[] = [
  { key: "new", label: "Новые" },
  { key: "published", label: "На сайте" },
  { key: "hidden", label: "Скрытые" },
  { key: "all", label: "Все" },
];
const statusBadge: Record<ReviewStatus, [string, BadgeTone]> = {
  new: ["Новый", "warning"],
  published: ["На сайте", "success"],
  hidden: ["Скрыт", "neutral"],
};

/**
 * Отзывы: очередь модерации. Сверху — средняя оценка и сколько ждут проверки, вкладки статусов со счётчиками, ниже —
 * отзывы одним листом: оценка, текст, автор и заказ, почему нельзя опубликовать, и действия.
 */
export default async function AdminReviews({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  await requireStaff("reviews.manage");
  const { s } = await searchParams;
  const filter = filters.find((f) => f.key === s)?.key ?? "new";
  const feedback = container().feedback;
  const [list, counts, summary] = await Promise.all([feedback.queries.list(filter), feedback.queries.counts(), feedback.queries.summary()]);
  const total = (counts.new ?? 0) + (counts.published ?? 0) + (counts.hidden ?? 0);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Отзывы клиентов">
        Ссылка на отзыв приходит в письме после доставки. На сайт попадает только то, что вы опубликуете, и только с согласия автора.
      </PageHeader>

      <StatRow>
        <StatTile bare label="Средняя оценка" value={summary.count ? `${summary.average.toFixed(1)} из 5` : "—"} hint={summary.count ? `по ${summary.count} отзывам` : undefined} />
        <StatTile bare label="Всего отзывов" value={String(total)} />
        <StatTile bare label="Ждут проверки" value={String(counts.new ?? 0)} href={filter === "new" ? undefined : "/admin/reviews"} />
        <StatTile bare label="На сайте" value={String(counts.published ?? 0)} />
      </StatRow>

      <Segmented
        label="Статус отзывов"
        className="self-start"
        items={filters.map((f) => ({
          key: f.key,
          href: f.key === "new" ? "/admin/reviews" : `/admin/reviews?s=${f.key}`,
          active: f.key === filter,
          label: (
            <>
              {f.label}
              {f.key !== "all" && counts[f.key] ? <span className="ml-1.5 tabular-nums opacity-70">{counts[f.key]}</span> : null}
            </>
          ),
        }))}
      />

      {list.length ? (
        <ul className="panel divide-y divide-line overflow-hidden">
          {list.map((r) => (
            <ReviewCard key={r.id} r={r} />
          ))}
        </ul>
      ) : (
        <div className="panel">
          <EmptyState icon={filter === "new" ? CircleCheck : MessageSquareQuote} title={filter === "new" ? "Новых отзывов нет, всё проверено" : "Здесь пока пусто"}>
            {filter === "new" ? "Новые отзывы приходят после доставки книги. Опубликованные — во вкладке «На сайте»." : "Отзывы с этим статусом появятся здесь."}
          </EmptyState>
        </div>
      )}
    </div>
  );
}

function ReviewCard({ r }: { r: StaffReview }) {
  const [label, tone] = statusBadge[r.status];
  const tooShort = r.text.trim().length < PUBLIC_TEXT_MIN;
  const blocker = !r.consent ? "Автор не разрешил показывать отзыв на сайте" : tooShort ? `Текст короче ${PUBLIC_TEXT_MIN} символов — на сайт не попадёт, но в средней оценке учтён` : null;
  const low = r.rating <= LOW_RATING;
  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:px-5 sm:py-5">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <span className={cn("flex gap-0.5", low ? "text-danger" : "text-warning")} role="img" aria-label={`Оценка ${r.rating} из 5`}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} className={cn("size-4", n <= r.rating ? "fill-current" : "text-line-strong")} strokeWidth={1.5} aria-hidden />
          ))}
        </span>
        <Badge tone={tone} dot>
          {label}
        </Badge>
        {low ? <Badge tone="danger">низкая оценка</Badge> : null}
        {r.featured ? (
          <Badge tone="accent">
            <Pin className="size-3" aria-hidden /> на главной первым
          </Badge>
        ) : null}
        <span className="ml-auto text-xs text-muted">{formatDate(r.createdAt, true)}</span>
      </div>

      <div className="flex gap-4">
        {r.photo ? (
          <a href={`/api/reviews/photo/${r.id}`} target="_blank" rel="noreferrer" className="shrink-0" title="Открыть фото">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/reviews/photo/${r.id}`} alt="Фото к отзыву" className="size-20 rounded-[10px] object-cover ring-1 ring-line sm:size-24" loading="lazy" />
          </a>
        ) : null}
        <p className={cn("max-w-[72ch] text-[15px] leading-relaxed whitespace-pre-line", r.text ? "text-ink" : "text-muted italic")}>{r.text || "Без текста — только оценка"}</p>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span>
          <b className="font-semibold">{r.authorName}</b>
          {r.city ? `, ${r.city}` : ""}
        </span>
        <span className="text-muted">{themes[r.theme] ?? r.theme}</span>
        {r.locale === "kk" ? <Badge>KK</Badge> : null}
        <Link href={`/admin/orders/${r.orderId}`} className="text-wine hover:underline">
          Заказ №{r.orderNumber}
        </Link>
        <span className="text-xs text-muted">{r.email}</span>
        {r.thankYouCode ? (
          <span className="text-xs text-muted" title="Код благодарности">
            код <span className="font-mono">{r.thankYouCode}</span>
          </span>
        ) : null}
        {r.photo ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted">
            <ImageIcon className="size-3" aria-hidden /> фото
          </span>
        ) : null}
      </div>

      {blocker ? (
        <Alert kind="info" className="py-2 text-xs">
          {blocker}
        </Alert>
      ) : null}
      <ReviewActions id={r.id} status={r.status} featured={r.featured} publishable={!blocker} />
    </li>
  );
}
