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
import { Choice, CopyButton, ResultEmpty, ToolField, Verdict, Workbench } from "./Workbench";

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

  const tone = plan && (plan.verdict === "hard" || plan.verdict === "express" || plan.verdict === "digital") ? "hot" : plan?.verdict === "tight" ? "warm" : "calm";
  const icon = plan?.verdict === "express" ? <Zap className="size-5" aria-hidden /> : plan?.verdict === "calm" ? <PackageCheck className="size-5" aria-hidden /> : plan ? <Clock className="size-5" aria-hidden /> : <CalendarDays className="size-5" aria-hidden />;
  const text = !value ? ui.empty : !typed ? ui.invalid : plan ? ui.verdict[plan.verdict](plan.perDay) : ui.empty;

  return (
    <Workbench
      input={
        <>
          <ToolField label={ui.dateLabel} htmlFor="plan-date">
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
          </ToolField>
          <ToolField label={ui.deliveryLabel}>
            <Choice label={ui.deliveryLabel} value={delivery} onChange={setDelivery} options={deliveries.map((d) => ({ id: d, label: ui.delivery[d] }))} />
          </ToolField>
          <ToolField label={ui.goalLabel}>
            <Choice label={ui.goalLabel} value={goal} onChange={setGoal} options={(Object.keys(GOALS) as Goal[]).map((id) => ({ id, label: ui.goal[id] }))} />
          </ToolField>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px] text-ink-soft">
            <input type="checkbox" className="size-4 accent-[var(--color-wine)]" checked={letters} onChange={(e) => setLetters(e.target.checked)} />
            {ui.lettersLabel}
          </label>
        </>
      }
      result={
        !value ? (
          <ResultEmpty>{ui.empty}</ResultEmpty>
        ) : (
          <div className="space-y-6">
            <Verdict tone={tone} icon={icon} testId="plan-verdict">
              {text}
            </Verdict>

            {plan && plan.steps.length && now ? (
              <div>
                <h3 className="font-serif text-2xl font-medium">{ui.stepsTitle}</h3>
                {/* Ось времени: слева дата и «осталось дней», справа шаг; заказ выделен. */}
                <ol className="mt-4">
                  {plan.steps.map((s, i) => (
                    <li key={`${s.id}-${i}`} className="grid grid-cols-[5.5rem_1fr] gap-x-4 sm:grid-cols-[6.5rem_1fr]">
                      <div className="pt-0.5 text-sm">
                        <div className="font-semibold text-ink">{fmt(s.date, true)}</div>
                        <div className="text-xs text-muted">{ui.daysLeft(daysBetween(now, s.date))}</div>
                      </div>
                      <div className={cn("relative border-l pb-6 pl-5 last:pb-0", s.id === "order" ? "border-wine" : "border-line-strong")}>
                        <span aria-hidden className={cn("absolute top-1.5 -left-[5px] size-2.5 rounded-full", s.id === "order" ? "bg-wine" : "bg-line-strong")} />
                        <div className={cn("font-medium", s.id === "order" && "text-wine")}>{ui.step[s.id].title}</div>
                        <div className="text-sm leading-relaxed text-ink-soft">{ui.step[s.id].text(plan.perDay)}</div>
                      </div>
                    </li>
                  ))}
                </ol>
                <div className="mt-6 flex flex-wrap gap-3">
                  <button type="button" className="btn btn-dark btn-sm" onClick={download}>
                    <CalendarDays className="size-4" /> {ui.ics}
                  </button>
                  <CopyButton text={copyText} label={ui.copy} done={ui.copied} />
                </div>
              </div>
            ) : null}
          </div>
        )
      }
    />
  );
}
