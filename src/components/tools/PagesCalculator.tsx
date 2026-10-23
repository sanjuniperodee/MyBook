"use client";

import { useMemo, useState } from "react";
import { useLocale, Link } from "@/i18n/client";
import { usefulUi } from "@/lib/content/tools/ui";
import { answersToGood, estimateBook, fullness, GOOD_PAGES, MIN_PRINT_PAGES, THICK_PAGES, THIN_PAGES, type AnswerLength, type BookPlan } from "@/lib/tools/pages";
import type { FormatId } from "@/lib/book/formats";
import { cn } from "@/lib/class-names";
import { Choice } from "./Choice";

function Slider({ id, label, value, max, onChange }: { id: string; label: string; value: number; max: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="label !mb-0" htmlFor={id}>
          {label}
        </label>
        <span className="font-serif text-2xl text-wine tabular-nums">{value}</span>
      </div>
      <input id={id} type="range" min={0} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-2 w-full accent-[var(--color-wine)]" />
    </div>
  );
}

/** Сколько страниц получится: тот же движок оценки, что у редактора. Обложка и преамбула (титул, оглавление) уже в счёте. */
export function PagesCalculator({ ctaHref }: { ctaHref: string }) {
  const ui = usefulUi[useLocale()].pages;
  const [format, setFormat] = useState<FormatId>("a5");
  const [length, setLength] = useState<AnswerLength>("medium");
  const [answers, setAnswers] = useState(30);
  const [photos, setPhotos] = useState(10);
  const [letters, setLetters] = useState(3);

  const plan: BookPlan = { format, length, answers, photos, letters };
  const size = useMemo(() => estimateBook(plan), [format, length, answers, photos, letters]); // eslint-disable-line react-hooks/exhaustive-deps
  const state = fullness(size, answers);
  const more = useMemo(() => (state === "thin" || state === "empty" ? answersToGood(plan) : 0), [state, format, length, answers, photos, letters]); // eslint-disable-line react-hooks/exhaustive-deps
  const gauge = Math.min(100, (size.raw / THICK_PAGES) * 100);

  return (
    <div className="card p-6 sm:p-8">
      <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-6">
          <div>
            <span className="label">{ui.formatLabel}</span>
            <Choice label={ui.formatLabel} value={format} onChange={setFormat} options={(["a5", "square"] as const).map((id) => ({ id, label: ui.format[id] }))} />
          </div>
          <Slider id="pages-answers" label={ui.answersLabel} value={answers} max={120} onChange={setAnswers} />
          <div>
            <span className="label">{ui.lengthLabel}</span>
            <Choice label={ui.lengthLabel} value={length} onChange={setLength} options={(["short", "medium", "long"] as const).map((id) => ({ id, label: ui.length[id] }))} />
          </div>
          <Slider id="pages-photos" label={ui.photosLabel} value={photos} max={80} onChange={setPhotos} />
          <Slider id="pages-letters" label={ui.lettersLabel} value={letters} max={15} onChange={setLetters} />
        </div>

        <aside className="self-start rounded-3xl bg-cream/70 p-6" aria-live="polite">
          <div className="font-serif text-7xl leading-none font-medium text-wine tabular-nums" data-testid="pages-total">
            {size.pages}
          </div>
          <div className="mt-1 text-ink-soft">{ui.pages}</div>
          <div className="mt-3 text-sm text-muted">
            {size.spineMm ? ui.spine(String(size.spineMm).replace(".", ",")) : null}
            {size.spineMm ? " · " : null}
            {ui.words(size.words)}
          </div>

          <div className="mt-6">
            <div className="relative h-2 rounded-full bg-white">
              <div className={cn("h-2 rounded-full transition-all", state === "good" ? "bg-emerald-500" : state === "thick" ? "bg-amber-500" : "bg-wine")} style={{ width: `${gauge}%` }} />
              <div className="absolute -top-1 h-4 w-px bg-ink/30" style={{ left: `${(GOOD_PAGES / THICK_PAGES) * 100}%` }} aria-hidden />
              <div className="absolute -top-1 h-4 w-px bg-ink/20" style={{ left: `${(THIN_PAGES / THICK_PAGES) * 100}%` }} aria-hidden />
            </div>
            <div className="mt-3 font-medium">{ui.state[state]}</div>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">{ui.stateText[state]}</p>
            {more > 0 && state !== "empty" ? <p className="mt-2 text-sm font-medium text-wine">{ui.addMore(more)}</p> : null}
          </div>
          <Link href={ctaHref} className="btn btn-primary btn-lg mt-6 w-full">
            {ui.cta}
          </Link>
        </aside>
      </div>
      <p className="mt-6 text-xs leading-relaxed text-muted">
        {ui.minNote(MIN_PRINT_PAGES)} {ui.note}
      </p>
    </div>
  );
}
