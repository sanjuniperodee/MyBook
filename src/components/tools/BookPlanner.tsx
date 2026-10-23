"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Clock, PackageCheck, Zap } from "lucide-react";
import type { DeliveryId } from "@/config/site";
import { useLocale } from "@/i18n/client";
import { dateFor } from "@/i18n/messages/partial";
import { usefulUi } from "@/lib/content/tools/ui";
import { buildIcs } from "@/lib/tools/ics";
import { GOALS, planFor, type Goal } from "@/lib/tools/plan";
import { daysBetween, parseDay } from "@/lib/tools/together";
import { cn } from "@/lib/class-names";
import { Choice, CopyButton } from "./Choice";

const deliveries: DeliveryId[] = ["courier", "post", "pickup", "abroad"];

/** План книги к дате: что и когда сделать, чтобы успеть; календарь скачивается файлом .ics. */
export function BookPlanner({ expressAvailable }: { expressAvailable: boolean }) {
  const locale = useLocale();
  const ui = usefulUi[locale].plan;
  const fmt = dateFor(locale);
  const [value, setValue] = useState("");
  const [delivery, setDelivery] = useState<DeliveryId>("courier");
  const [goal, setGoal] = useState<Goal>("normal");
  const [letters, setLetters] = useState(true);
  const [now, setNow] = useState<Date | null>(null);

  const plan = useMemo(() => (value && now ? planFor({ target: value, delivery, now, goal, letters, expressAvailable }) : null), [value, now, delivery, goal, letters, expressAvailable]);
  const typed = !!value && !!parseDay(value);
  const target = parseDay(value);

  const lines = plan && plan.steps.length && target ? plan.steps.map((s) => `${fmt(s.date, true)} — ${ui.step[s.id].title}`) : [];
  const copyText = target ? [ui.copyHeader(fmt(target, true)), ...lines].join("\n") : "";

  const download = () => {
    if (!plan || !target) return;
    const events = plan.steps.map((s) => ({ uid: `${s.id}-${value}@mybook.kz`, date: s.date, summary: `${ui.icsPrefix}: ${ui.step[s.id].title}`, description: ui.step[s.id].text(plan.perDay) }));
    const blob = new Blob([buildIcs(events, { calendarName: ui.icsPrefix })], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = ui.icsName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const hot = plan && (plan.verdict === "hard" || plan.verdict === "express" || plan.verdict === "digital");
  const warm = plan?.verdict === "tight";
  const Icon = plan?.verdict === "express" ? Zap : plan?.verdict === "calm" ? PackageCheck : plan ? Clock : CalendarDays;
  const text = !value ? ui.empty : !typed ? ui.invalid : plan ? ui.verdict[plan.verdict](plan.perDay) : ui.empty;

  return (
    <div className="card p-6 sm:p-8">
      <div className="grid gap-5 sm:grid-cols-[minmax(0,260px)_1fr]">
        <div>
          <label className="label" htmlFor="plan-date">
            {ui.dateLabel}
          </label>
          <input
            id="plan-date"
            type="date"
            className="input"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setNow(new Date());
            }}
          />
        </div>
        <div>
          <span className="label">{ui.deliveryLabel}</span>
          <Choice label={ui.deliveryLabel} value={delivery} onChange={setDelivery} options={deliveries.map((d) => ({ id: d, label: ui.delivery[d] }))} />
        </div>
      </div>
      <div className="mt-5 grid gap-5 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <span className="label">{ui.goalLabel}</span>
          <Choice label={ui.goalLabel} value={goal} onChange={setGoal} options={(Object.keys(GOALS) as Goal[]).map((id) => ({ id, label: ui.goal[id] }))} />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" className="size-4 accent-[var(--color-wine)]" checked={letters} onChange={(e) => setLetters(e.target.checked)} />
          {ui.lettersLabel}
        </label>
      </div>

      <div aria-live="polite" className={cn("mt-6 flex items-start gap-4 rounded-2xl border p-5", hot ? "border-wine/30 bg-rose/40" : warm ? "border-amber-200 bg-amber-50/70" : "border-line bg-cream/50")}>
        <Icon className={cn("mt-0.5 size-6 shrink-0", hot ? "text-wine" : "text-ink-soft")} aria-hidden />
        <p className="leading-relaxed text-ink" data-testid="plan-verdict">
          {text}
        </p>
      </div>

      {plan && plan.steps.length && now ? (
        <div className="mt-8">
          <h3 className="font-serif text-2xl font-medium">{ui.stepsTitle}</h3>
          <ol className="mt-4 space-y-3">
            {plan.steps.map((s, i) => (
              <li key={`${s.id}-${i}`} className={cn("flex gap-4 rounded-2xl border p-4", s.id === "order" ? "border-wine/40 bg-rose/30" : "border-line bg-white")}>
                <div className="w-24 shrink-0 text-sm">
                  <div className="font-semibold text-ink">{fmt(s.date, true)}</div>
                  <div className="text-xs text-muted">{ui.daysLeft(daysBetween(now, s.date))}</div>
                </div>
                <div>
                  <div className="font-medium">{ui.step[s.id].title}</div>
                  <div className="text-sm leading-relaxed text-ink-soft">{ui.step[s.id].text(plan.perDay)}</div>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" className="btn btn-primary btn-sm" onClick={download}>
              <CalendarDays className="size-4" /> {ui.ics}
            </button>
            <CopyButton text={copyText} label={ui.copy} done={ui.copied} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
