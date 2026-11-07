"use client";

import { useMemo, useState } from "react";
import { useLocale, Link } from "@/i18n/client";
import { usefulUi } from "@/lib/content/tools/ui";
import { answersToGood, estimateBook, fullness, GOOD_PAGES, MIN_PRINT_PAGES, THICK_PAGES, THIN_PAGES, type AnswerLength, type BookPlan } from "@/lib/tools/pages";
import type { FormatId } from "@/lib/book/formats";
import { cn } from "@/lib/class-names";
import { Choice, Figure, ToolField, Workbench } from "./Workbench";

function Slider({ id, label, value, max, onChange }: { id: string; label: string; value: number; max: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="label !mb-0" htmlFor={id}>
          {label}
        </label>
        <span className="font-serif text-2xl text-wine tabular-nums">{value}</span>
      </div>
      <input id={id} type="range" min={0} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-2 h-8 w-full accent-[var(--color-wine)]" />
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
    <Workbench
      cta={false}
      input={
        <>
          <ToolField label={ui.formatLabel}>
            <Choice label={ui.formatLabel} value={format} onChange={setFormat} options={(["a5", "square"] as const).map((id) => ({ id, label: ui.format[id] }))} />
          </ToolField>
          <Slider id="pages-answers" label={ui.answersLabel} value={answers} max={120} onChange={setAnswers} />
          <ToolField label={ui.lengthLabel}>
            <Choice label={ui.lengthLabel} value={length} onChange={setLength} options={(["short", "medium", "long"] as const).map((id) => ({ id, label: ui.length[id] }))} />
          </ToolField>
          <Slider id="pages-photos" label={ui.photosLabel} value={photos} max={80} onChange={setPhotos} />
          <Slider id="pages-letters" label={ui.lettersLabel} value={letters} max={15} onChange={setLetters} />
          <p className="text-xs leading-relaxed text-muted">
            {ui.minNote(MIN_PRINT_PAGES)} {ui.note}
          </p>
        </>
      }
      result={
        <div aria-live="polite">
          <Figure value={size.pages} caption={ui.pages} testId="pages-total" />
          <div className="mt-2 text-sm text-muted">
            {size.spineMm ? ui.spine(String(size.spineMm).replace(".", ",")) : null}
            {size.spineMm ? " · " : null}
            {ui.words(size.words)}
          </div>

          {/* Шкала толщины: слева тонкая книга, дальше — «в самый раз» и «толстая»; засечки — границы. */}
          <div className="mt-7">
            <div className="relative h-2 rounded-[3px] bg-line">
              <div className={cn("h-2 rounded-[3px] transition-all", state === "good" ? "bg-success" : state === "thick" ? "bg-warning" : "bg-wine")} style={{ width: `${gauge}%` }} />
              <div className="absolute -top-1 h-4 w-px bg-ink/40" style={{ left: `${(GOOD_PAGES / THICK_PAGES) * 100}%` }} aria-hidden />
              <div className="absolute -top-1 h-4 w-px bg-ink/25" style={{ left: `${(THIN_PAGES / THICK_PAGES) * 100}%` }} aria-hidden />
            </div>
            <div className="mt-4 font-medium">{ui.state[state]}</div>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">{ui.stateText[state]}</p>
            {more > 0 && state !== "empty" ? <p className="mt-2 text-sm font-medium text-wine">{ui.addMore(more)}</p> : null}
          </div>
          <Link href={ctaHref} className="btn btn-primary btn-lg mt-7 w-full">
            {ui.cta}
          </Link>
        </div>
      }
    />
  );
}
