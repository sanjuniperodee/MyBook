"use client";

/**
 * Элементы управления редактора фото — тёмная «фотостудия» (на тёмном фоне цвета снимка видны честнее): ползунок с
 * подписью и сбросом, образцы цвета, переключатель вариантов, кнопка-значок с подписью. Цели нажатия — от 44 px.
 */
import { useId, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/class-names";

/** Ползунок: подпись, значение, сброс к нулю (двойной щелчок по подписи — тоже). onCommit — палец отпустили. */
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  onReset,
  resetLabel,
  format = (v) => String(Math.round(v)),
  center,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  onReset?: () => void;
  resetLabel?: string;
  format?: (v: number) => string;
  /** Точка «ноль» шкалы двусторонних ползунков: заливка идёт от неё. */
  center?: number;
}) {
  const id = useId();
  const pct = (v: number) => ((v - min) / (max - min)) * 100;
  const from = center === undefined ? 0 : pct(center);
  const to = pct(value);
  return (
    <div>
      <div className="flex min-h-6 items-center justify-between gap-2 text-[13px]">
        <label htmlFor={id} className="text-white/75 select-none" onDoubleClick={onReset}>
          {label}
        </label>
        <span className="flex items-center gap-1.5">
          <span className="tabular-nums text-white/55">{format(value)}</span>
          {onReset ? (
            <button
              type="button"
              onClick={onReset}
              aria-label={resetLabel}
              title={resetLabel}
              className="-my-2 flex size-8 items-center justify-center rounded-full text-white/45 transition hover:bg-white/10 hover:text-white"
            >
              <RotateCcw className="size-3.5" />
            </button>
          ) : null}
        </span>
      </div>
      <div className="relative flex h-9 items-center">
        <div className="absolute inset-x-0 h-1 rounded-full bg-white/15" />
        <div
          className="absolute h-1 rounded-full bg-[#e9b8bf]"
          style={{
            left: `${Math.min(from, to)}%`,
            width: `${Math.abs(to - from)}%`,
          }}
        />
        {center !== undefined ? <div className="absolute h-2.5 w-px bg-white/40" style={{ left: `${from}%` }} /> : null}
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="pe-range relative h-9 w-full cursor-pointer appearance-none bg-transparent"
        />
      </div>
    </div>
  );
}

/** Палитра надписей и рисунка: светлые, тёмные, тёплые, яркие — и свой цвет. */
export const SWATCHES = ["#FFFFFF", "#111111", "#F3EDE3", "#7A1F2B", "#B8915A", "#E5484D", "#FF8A1F", "#FFD43B", "#2F9E44", "#1C7ED6", "#7048E8", "#F783AC"];

export function Swatches({
  value,
  onChange,
  label,
  customLabel,
  none,
  noneLabel,
}: {
  value: string | null;
  onChange: (c: string | null) => void;
  label: string;
  customLabel: string;
  none?: boolean;
  noneLabel?: string;
}) {
  const list = value && !SWATCHES.includes(value.toUpperCase()) ? [...SWATCHES, value.toUpperCase()] : SWATCHES;
  return (
    <div role="radiogroup" aria-label={label} className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 py-1 lg:flex-wrap lg:overflow-visible">
      {none ? (
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          aria-label={noneLabel}
          title={noneLabel}
          onClick={() => onChange(null)}
          className={cn("relative size-9 shrink-0 rounded-full border border-white/25 bg-transparent transition", value === null && "ring-2 ring-white ring-offset-2 ring-offset-[#1e1a17]")}
        >
          <span className="absolute inset-x-1.5 top-1/2 h-0.5 -rotate-45 rounded bg-[#E5484D]" />
        </button>
      ) : null}
      {list.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value?.toUpperCase() === c}
          aria-label={c}
          title={c}
          onClick={() => onChange(c)}
          className={cn("size-9 shrink-0 rounded-full border border-white/20 transition active:scale-90", value?.toUpperCase() === c && "ring-2 ring-white ring-offset-2 ring-offset-[#1e1a17]")}
          style={{ background: c }}
        />
      ))}
      <label
        className="relative size-9 shrink-0 cursor-pointer overflow-hidden rounded-full border border-white/25"
        title={customLabel}
        style={{
          background: "conic-gradient(#f03e3e, #ffd43b, #40c057, #22b8cf, #4c6ef5, #be4bdb, #f03e3e)",
        }}
      >
        <span className="sr-only">{customLabel}</span>
        <input type="color" className="absolute inset-0 cursor-pointer opacity-0" value={value ?? "#ffffff"} onChange={(e) => onChange(e.target.value.toUpperCase())} />
      </label>
    </div>
  );
}

/** Выбор одного из вариантов. */
export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-xl bg-white/[.07] p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          aria-label={o.title}
          title={o.title}
          onClick={() => onChange(o.id)}
          className={cn(
            "flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-[13px] whitespace-nowrap transition",
            value === o.id ? "bg-white font-medium text-ink shadow" : "text-white/70 hover:text-white",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Подпись раздела панели. */
export function Label({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <div className="text-[11px] font-semibold tracking-[0.14em] text-white/50 uppercase">{children}</div>
      {aside}
    </div>
  );
}

/** Кнопка действия со значком и подписью (дублировать, удалить, повернуть…). */
export function ActionButton({ icon, label, onClick, danger, disabled, active }: { icon: ReactNode; label: string; onClick: () => void; danger?: boolean; disabled?: boolean; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "flex min-h-14 min-w-16 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 text-[11px] leading-tight transition disabled:opacity-35",
        active ? "bg-white text-ink" : danger ? "bg-white/[.06] text-[#ff8f8f] hover:bg-[#E5484D]/15" : "bg-white/[.06] text-white/85 hover:bg-white/[.12]",
      )}
    >
      {icon}
      <span className="text-center">{label}</span>
    </button>
  );
}
