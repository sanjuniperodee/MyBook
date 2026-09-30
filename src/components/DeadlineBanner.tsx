import { CalendarHeart, Clock, Zap } from "lucide-react";
import { Link } from "@/i18n/client";
import { getMessages } from "@/i18n/server";
import { deadlineFor, getOccasion, parseDay } from "@/lib/occasions";
import { cn, nowMs } from "@/lib/utils";

/** Сколько ответов считаем «полноценной книгой» для расчёта темпа. */
const GOOD_BOOK_ANSWERS = 30;

/**
 * Отсчёт до праздника: когда оформить заказ и какой нужен темп письма.
 * Показывается на обзоре книги; без даты — приглашение указать повод.
 */
export async function DeadlineBanner({
  bookId,
  occasion,
  occasionDate,
  answered,
  compact,
}: {
  bookId: string;
  occasion: string | null;
  occasionDate: string | null;
  answered: number;
  compact?: boolean;
}) {
  const m = (await getMessages()).common;
  const o = getOccasion(occasion);
  if (!o || !occasionDate) {
    if (compact) return null;
    return (
      <Link href={`/books/${bookId}/settings#occasion`} className="mt-4 inline-flex items-center gap-2 text-sm text-muted underline-offset-4 hover:text-wine hover:underline">
        <CalendarHeart className="size-4" /> {m.deadline.addDate}
      </Link>
    );
  }
  const dl = deadlineFor(occasionDate, new Date(nowMs()));
  if (dl.state === "past") return null;
  const left = Math.max(0, GOOD_BOOK_ANSWERS - answered);
  const perDay = left && dl.daysToOrder > 0 ? Math.ceil(left / dl.daysToOrder) : 0;
  const tone = dl.state === "relaxed" ? "calm" : dl.state === "soon" ? "warm" : "hot";

  return (
    <div
      className={cn(
        "flex max-w-xl items-start gap-4 rounded-3xl border p-4 sm:p-5",
        tone === "calm" && "border-line bg-white",
        tone === "warm" && "border-amber-200 bg-amber-50/70",
        tone === "hot" && "border-wine/30 bg-rose/40",
        compact ? "mt-0" : "mt-6",
      )}
      data-testid="deadline-banner"
    >
      <div className={cn("flex size-11 shrink-0 flex-col items-center justify-center rounded-2xl leading-none", tone === "hot" ? "bg-wine text-white" : "bg-cream text-ink")}>
        <span className="font-serif text-lg font-medium tabular-nums">{dl.daysToTarget}</span>
        <span className="text-[9px] tracking-wide uppercase opacity-70">{m.daysShort}</span>
      </div>
      <div className="min-w-0 flex-1 text-sm leading-relaxed">
        <div className="font-medium text-ink">{m.deadline.headline(m.occasions[o.id].label, parseDay(occasionDate), dl.daysToTarget)}</div>
        {dl.state === "digital" ? (
          <p className="text-ink-soft">{m.deadline.digital}</p>
        ) : dl.state === "premium" ? (
          <p className="text-ink-soft">
            <Zap className="mr-1 inline size-3.5 text-wine" />
            {m.deadline.premium(dl.orderByPremium)}
          </p>
        ) : (
          <p className="text-ink-soft">
            <Clock className="mr-1 inline size-3.5" />
            {m.deadline.orderBy(dl.orderBy, dl.daysToOrder)}
            {perDay ? m.deadline.pace(perDay) : null}
          </p>
        )}
        {!compact ? (
          <Link href={`/books/${bookId}/settings#occasion`} className="mt-1 inline-block text-xs text-muted hover:text-wine">
            {m.deadline.changeDate}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
