"use client";

/**
 * Элементы управления редактора фото: ползунок с подписью и сбросом, образцы цвета, переключатель вариантов,
 * кнопка-значок с подписью. Цвета — токены кабинета (редактор следует светлой и тёмной теме сайта), цели нажатия —
 * от 44 px. Выбранное везде одинаково: розовая подложка, винная подпись и тонкая винная рамка.
 */
import { useId, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/class-names";

/** Видимая обводка фокуса — как у кнопок кита (.btn). */
export const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine";

/** Выбранный элемент панели: цвет не единственный признак — у выбранного ещё и рамка. */
export const SELECTED = "bg-rose text-wine ring-1 ring-wine";

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
        <label htmlFor={id} className="font-medium text-ink-soft select-none" onDoubleClick={onReset}>
          {label}
        </label>
        <span className="flex items-center gap-1.5">
          <span className="text-muted tabular-nums">{format(value)}</span>
          {onReset ? (
            <button
              type="button"
              onClick={onReset}
              aria-label={resetLabel}
              title={resetLabel}
              className={cn("-my-2 flex size-8 items-center justify-center rounded-[var(--r-ctl)] text-muted transition hover:bg-sunken hover:text-ink", FOCUS)}
            >
              <RotateCcw className="size-3.5" />
            </button>
          ) : null}
        </span>
      </div>
      <div className="relative flex h-9 items-center">
        <div className="absolute inset-x-0 h-1 rounded-full bg-line-strong" />
        <div
          className="absolute h-1 rounded-full bg-wine"
          style={{
            left: `${Math.min(from, to)}%`,
            width: `${Math.abs(to - from)}%`,
          }}
        />
        {center !== undefined ? <div className="absolute h-2.5 w-px bg-muted" style={{ left: `${from}%` }} /> : null}
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="pe-range relative h-9 w-full cursor-pointer appearance-none bg-transparent focus-visible:outline-wine! [&::-moz-range-thumb]:box-border [&::-moz-range-thumb]:border-2! [&::-moz-range-thumb]:border-solid! [&::-moz-range-thumb]:border-wine! [&::-webkit-slider-thumb]:box-border [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-solid [&::-webkit-slider-thumb]:border-wine"
        />
      </div>
    </div>
  );
}

/** Палитра надписей и рисунка: светлые, тёмные, тёплые, яркие — и свой цвет. Это цвета самих надписей на снимке, а не оформления. */
export const SWATCHES = ["#FFFFFF", "#111111", "#F3EDE3", "#7A1F2B", "#B8915A", "#E5484D", "#FF8A1F", "#FFD43B", "#2F9E44", "#1C7ED6", "#7048E8", "#F783AC"];

const swatchRing = "ring-2 ring-ink ring-offset-2 ring-offset-white";

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
    <div role="radiogroup" aria-label={label} className="no-scrollbar -mx-1 flex gap-2.5 overflow-x-auto px-1 py-1.5 lg:flex-wrap lg:overflow-visible">
      {none ? (
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          aria-label={noneLabel}
          title={noneLabel}
          onClick={() => onChange(null)}
          className={cn("relative size-9 shrink-0 rounded-full border border-line-strong bg-transparent transition", FOCUS, value === null && swatchRing)}
        >
          <span className="absolute inset-x-1.5 top-1/2 h-0.5 -rotate-45 rounded bg-danger" />
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
          className={cn("size-9 shrink-0 rounded-full border border-line-strong transition active:scale-90", FOCUS, value?.toUpperCase() === c && swatchRing)}
          style={{ background: c }}
        />
      ))}
      {/* Круг «свой цвет» — цветовой круг, это сама подсказка, что откроется выбор любого цвета. */}
      <label
        className="relative size-9 shrink-0 cursor-pointer overflow-hidden rounded-full border border-line-strong focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-wine"
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
    <div role="radiogroup" aria-label={label} className="flex rounded-[var(--r-ctl)] bg-sunken p-1">
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
            "flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[calc(var(--r-ctl)-3px)] px-2 text-[13px] whitespace-nowrap transition",
            FOCUS,
            value === o.id ? "bg-white font-medium text-ink ring-1 ring-line-strong" : "text-muted hover:text-ink",
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
      <div className="text-xs font-medium text-muted">{children}</div>
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
        "flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-[var(--r-ctl)] border px-1 text-[11px] leading-tight transition disabled:pointer-events-none disabled:opacity-40 sm:text-xs",
        FOCUS,
        active ? "border-wine bg-rose text-wine" : danger ? "border-line bg-white text-danger hover:border-danger hover:bg-danger-bg" : "border-line bg-white text-ink-soft hover:border-line-strong hover:bg-sunken hover:text-ink",
      )}
    >
      {icon}
      <span className="text-center">{label}</span>
    </button>
  );
}
