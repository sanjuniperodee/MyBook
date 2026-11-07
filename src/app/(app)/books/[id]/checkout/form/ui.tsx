"use client";

import { Fragment } from "react";
import { useMessages } from "@/i18n/client";
import { cn } from "@/lib/class-names";
import { StepNode } from "../../StepNode";

/** Вариант выбора (тариф, доставка, допы): выбранный — рамка цвета переплёта, как у всех «строк выбора» оформления. */
export const option = (on: boolean) => cn("rounded-[10px] border bg-white transition-colors", on ? "border-wine bg-rose/25 ring-2 ring-wine/15" : "border-line-strong hover:border-ink/35");

/** Точка радиокнопки для строк выбора (сами строки — role="radio"). */
export function RadioDot({ on }: { on: boolean }) {
  return (
    <span aria-hidden className={cn("mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-full border-2", on ? "border-wine" : "border-line-strong")}>
      {on ? <span className="size-2 rounded-full bg-wine" /> : null}
    </span>
  );
}

/** Группа внутри шага: заголовок и пояснение одной строкой, затем поля. */
export function Group({ title, hint, children, className }: { title: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <fieldset className={cn("min-w-0 border-0 p-0", className)}>
      <legend className="mb-3 w-full p-0">
        <span className="block text-[15px] font-semibold">{title}</span>
        {hint ? <span className="mt-0.5 block text-sm font-normal text-muted">{hint}</span> : null}
      </legend>
      {children}
    </fieldset>
  );
}

/** Шаги мастера: где я и сколько осталось; пройденные шаги — кнопки назад. */
export function Stepper({ steps, current, reached, onGo }: { steps: { id: string; label: string; short: string }[]; current: number; reached: number; onGo: (i: number) => void }) {
  const t = useMessages().checkout;
  return (
    <nav aria-label={t.stepsAria}>
      <ol className="flex items-center gap-1.5 sm:gap-3">
        {steps.map((s, i) => (
          <Fragment key={s.id}>
            {i > 0 ? <li aria-hidden className={cn("h-px min-w-3 flex-1", i <= current ? "bg-wine/50" : "bg-line-strong")} /> : null}
            <li>
              <button
                type="button"
                onClick={() => onGo(i)}
                disabled={i > reached}
                aria-current={i === current ? "step" : undefined}
                className={cn("flex min-h-11 items-center gap-2 rounded-[10px] px-1 text-sm font-medium transition-colors disabled:cursor-default", i === current ? "text-ink" : i < current ? "text-ink-soft hover:text-ink" : "text-muted")}
              >
                <StepNode status={i < current ? "done" : "todo"} fraction={0} n={i + 1} current={i === current} />
                <span className="sm:hidden">{s.short}</span>
                <span className="hidden sm:inline">{s.label}</span>
              </button>
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}
