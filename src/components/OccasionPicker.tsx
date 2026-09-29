"use client";

import { useState } from "react";
import { CalendarHeart, Check } from "lucide-react";
import { deadlineFor, getOccasion, humanDay, inDays, nextFixedDate, occasions, toIsoDay, type OccasionId } from "@/lib/occasions";
import { cn, nowMs } from "@/lib/utils";

/**
 * Выбор повода и даты. Для праздников с фиксированной датой дата подставляется сама.
 * Отдаёт скрытые поля occasion и occasionDate — работает внутри обычной формы.
 */
export function OccasionPicker({
  defaultOccasion,
  defaultDate,
  onChange,
  disabled,
}: {
  defaultOccasion?: string | null;
  defaultDate?: string | null;
  onChange?: (occasion: OccasionId | null, date: string | null) => void;
  disabled?: boolean;
}) {
  const [occasion, setOccasion] = useState<OccasionId | null>((getOccasion(defaultOccasion)?.id as OccasionId) ?? null);
  const [date, setDate] = useState(defaultDate ?? "");
  const [now] = useState(() => new Date(nowMs()));
  const today = toIsoDay(now);

  const pick = (id: OccasionId) => {
    if (disabled) return;
    if (occasion === id) {
      setOccasion(null);
      onChange?.(null, null);
      return;
    }
    setOccasion(id);
    const fixed = nextFixedDate(getOccasion(id)!, now);
    if (fixed) setDate(fixed);
    onChange?.(id, fixed ?? (date || null));
  };
  const changeDate = (v: string) => {
    setDate(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) onChange?.(occasion, v);
  };

  const dl = date && date >= today ? deadlineFor(date, now) : null;
  const o = getOccasion(occasion);

  return (
    <div>
      <input type="hidden" name="occasion" value={occasion ?? ""} />
      <input type="hidden" name="occasionDate" value={occasion ? date : ""} />
      <div className="flex flex-wrap gap-2">
        {occasions.map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => pick(x.id)}
            aria-pressed={occasion === x.id}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition",
              occasion === x.id ? "border-wine bg-wine/5 text-wine" : "border-line bg-white hover:border-ink/30",
            )}
          >
            {occasion === x.id ? <Check className="size-3.5" /> : null}
            {x.label}
          </button>
        ))}
      </div>
      {o ? (
        <div className="mt-4 flex flex-col gap-3 rounded-2xl bg-cream/60 p-4 sm:flex-row sm:items-center">
          <label className="flex items-center gap-3">
            <CalendarHeart className="size-5 shrink-0 text-wine" />
            <span className="text-sm whitespace-nowrap">Дата</span>
            <input type="date" className="input h-10 w-auto" value={date} min={today} onChange={(e) => changeDate(e.target.value)} disabled={disabled} aria-label="Дата праздника" />
          </label>
          {dl ? (
            <p className="text-sm leading-snug text-ink-soft">
              {dl.state === "past" ? null : dl.state === "digital" ? (
                <>Печатная книга уже не успеет — но электронную можно подарить в тот же день.</>
              ) : dl.state === "premium" ? (
                <>Успеет только «Премиум» с приоритетным производством — закажите до {humanDay(dl.orderByPremium)}.</>
              ) : (
                <>
                  До {o.until} {inDays(dl.daysToTarget)}. Чтобы успеть с доставкой, закажите книгу до <b className="font-medium text-ink">{humanDay(dl.orderBy)}</b>.
                </>
              )}
            </p>
          ) : (
            <p className="text-sm text-muted">Укажите дату — подскажем, до какого дня оформить заказ.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
