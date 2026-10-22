"use client";

/**
 * Элементы управления дизайнера (страницы и обложка): число со степпером, полем и ползунком, цвет с образцами,
 * переключатель вариантов и флажок. Значения ограничиваются здесь же — сервер всё равно проверяет их ещё раз.
 */
import { useId, useState, type ReactNode } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { cn } from "@/lib/class-names";

const decimals = (step: number) => (step >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(step) - 1e-9)));
const clampTo = (v: number, min: number, max: number, step: number) => {
  const k = 10 ** decimals(step);
  return Math.round(Math.min(max, Math.max(min, v)) * k) / k;
};

/** Подпись поля с кнопкой «как в стиле», если значение своё. */
export function FieldLabel({ label, htmlFor, onReset, resetLabel, children }: { label: string; htmlFor?: string; onReset?: () => void; resetLabel?: string; children?: ReactNode }) {
  return (
    <div className="mb-1.5 flex min-h-5 items-center justify-between gap-2">
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink-soft">
        {label}
      </label>
      <div className="flex items-center gap-2">
        {children}
        {onReset ? (
          <button type="button" onClick={onReset} title={resetLabel} aria-label={resetLabel} className="text-muted transition hover:text-wine">
            <RotateCcw className="size-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Число: «−», поле ввода, «+» и ползунок. Ввод с клавиатуры применяется по Enter или уходу из поля; стрелки ↑/↓ — шаг
 * (с Shift — десять шагов). display — как показать значение (например, в процентах).
 */
export function NumberField({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
  onReset,
  resetLabel,
  disabled,
  slider = true,
  scale = 1,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (v: number) => void;
  /** Своё значение — кнопка «вернуть как в стиле». */
  onReset?: () => void;
  resetLabel?: string;
  disabled?: boolean;
  slider?: boolean;
  /** Множитель показа: значение 0.25 при scale 100 показывается как 25. */
  scale?: number;
}) {
  const id = useId();
  const shown = clampTo(value * scale, min * scale, max * scale, step * scale);
  // Черновик ввода живёт, пока поле в фокусе; иначе показываем само значение.
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (raw: string) => {
    const v = Number(raw.replace(",", "."));
    if (Number.isFinite(v) && raw.trim() !== "") onChange(clampTo(v / scale, min, max, step));
    setDraft(null);
  };
  const nudge = (k: number) => onChange(clampTo(value + step * k, min, max, step));
  return (
    <div className={cn(disabled && "pointer-events-none opacity-50")}>
      <FieldLabel label={label} htmlFor={id} onReset={onReset} resetLabel={resetLabel} />
      <div className="flex items-center gap-2">
        <div className="flex h-9 shrink-0 items-center rounded-lg border border-line bg-white">
          <button type="button" aria-label="−" onClick={() => nudge(-1)} className="flex h-full w-8 items-center justify-center text-muted hover:text-ink">
            <Minus className="size-3.5" />
          </button>
          <input
            id={id}
            inputMode="decimal"
            className="h-full w-14 border-x border-line bg-transparent text-center text-sm tabular-nums outline-none focus:bg-cream/40"
            value={draft ?? String(shown)}
            onFocus={() => setDraft(String(shown))}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                commit((e.target as HTMLInputElement).value);
                setDraft(String(shown));
              }
              if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                e.preventDefault();
                nudge((e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 10 : 1));
              }
            }}
          />
          <button type="button" aria-label="+" onClick={() => nudge(1)} className="flex h-full w-8 items-center justify-center text-muted hover:text-ink">
            <Plus className="size-3.5" />
          </button>
        </div>
        {unit ? <span className="w-6 shrink-0 text-xs text-muted">{unit}</span> : null}
        {slider ? (
          <input
            type="range"
            aria-label={label}
            className="min-w-0 flex-1 accent-wine"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(clampTo(Number(e.target.value), min, max, step))}
          />
        ) : null}
      </div>
    </div>
  );
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Цвет: образцы, своя палитра браузера и поле #RRGGBB; allowNone — ещё вариант «нет». */
export function ColorField({
  label,
  value,
  onChange,
  swatches = [],
  allowNone,
  noneLabel,
  onReset,
  resetLabel,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  swatches?: string[];
  allowNone?: boolean;
  noneLabel?: string;
  onReset?: () => void;
  resetLabel?: string;
}) {
  const id = useId();
  // Черновик #RRGGBB, пока поле в фокусе.
  const [draft, setDraft] = useState<string | null>(null);
  const list = [...new Set(swatches.map((s) => s.toUpperCase()))];
  return (
    <div>
      <FieldLabel label={label} htmlFor={id} onReset={onReset} resetLabel={resetLabel} />
      <div className="flex flex-wrap items-center gap-1.5">
        {allowNone ? (
          <button
            type="button"
            title={noneLabel}
            aria-label={noneLabel}
            aria-pressed={value === null}
            onClick={() => onChange(null)}
            className={cn("relative size-7 rounded-full border bg-white", value === null ? "ring-2 ring-wine ring-offset-1" : "border-line")}
          >
            <span className="absolute inset-x-1 top-1/2 h-px -rotate-45 bg-red-500" />
          </button>
        ) : null}
        {list.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            aria-label={c}
            aria-pressed={value?.toUpperCase() === c}
            onClick={() => onChange(c)}
            className={cn("size-7 rounded-full border border-black/10 transition hover:scale-110", value?.toUpperCase() === c && "ring-2 ring-wine ring-offset-1")}
            style={{ background: c }}
          />
        ))}
        <label className="relative size-7 cursor-pointer overflow-hidden rounded-full border border-line" title={label} style={{ background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)" }}>
          <input type="color" className="absolute inset-0 cursor-pointer opacity-0" value={value && HEX.test(value) ? value : "#000000"} onChange={(e) => onChange(e.target.value.toUpperCase())} />
        </label>
        <input
          id={id}
          className="h-8 w-24 rounded-lg border border-line bg-white px-2 font-mono text-xs uppercase outline-none focus:border-wine/50"
          value={draft ?? value ?? ""}
          maxLength={7}
          placeholder="#RRGGBB"
          onFocus={() => setDraft(value ?? "")}
          onChange={(e) => {
            const v = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
            setDraft(v);
            if (HEX.test(v)) onChange(v.toUpperCase());
          }}
          onBlur={() => setDraft(null)}
        />
      </div>
    </div>
  );
}

/** Выбор одного из вариантов (кнопки в ряд). */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  onReset,
  resetLabel,
  wrap,
}: {
  label?: string;
  value: T | undefined;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  onReset?: () => void;
  resetLabel?: string;
  wrap?: boolean;
}) {
  return (
    <div>
      {label ? <FieldLabel label={label} onReset={onReset} resetLabel={resetLabel} /> : null}
      <div role="radiogroup" aria-label={label} className={cn("inline-flex max-w-full gap-1 rounded-xl bg-cream/80 p-1", wrap ? "flex-wrap" : "no-scrollbar overflow-x-auto")}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cn("flex h-8 min-w-8 shrink-0 items-center justify-center gap-1 rounded-lg px-2.5 text-[13px] transition", value === o.value ? "bg-white font-medium text-ink shadow-soft" : "text-muted hover:text-ink")}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Флажок-переключатель. */
export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-5 w-9 rounded-full bg-line transition peer-checked:bg-wine peer-focus-visible:outline-2 peer-focus-visible:outline-wine" />
        <span className="absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
      </span>
      <span className="text-sm">
        <span className="text-ink">{label}</span>
        {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
      </span>
    </label>
  );
}

/** Раздел панели: заголовок и поля. */
export function PanelSection({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="space-y-4 border-b border-line/70 pb-5 last:border-0">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-[0.14em] text-muted uppercase">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}
