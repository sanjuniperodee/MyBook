"use client";

/**
 * Стороны обложки в редакторе: переключатель «Лицо / Оборот», обложка целиком (оборот, корешок, лицо — нажатие по
 * стороне её выбирает), фон оборота («как спереди» или свой цвет) и варианты оборота для конструктора.
 */
import type { ReactNode } from "react";
import { Check, Link2 } from "lucide-react";
import { useMessages } from "@/i18n/client";
import { ColorField } from "@/components/design/controls";
import { backLayouts, type BackLayout } from "@/lib/book/cover-back";
import type { CoverBackground, CoverSide } from "@/lib/book/cover-design";
import { cn } from "@/lib/class-names";
import { LayoutIcon } from "./BackSection";

/** Какую сторону править: лицо или оборот — общий для «Шаблон и текст» и конструктора. */
export function SideSwitch({ side, onChange, compact, className }: { side: CoverSide; onChange: (side: CoverSide) => void; compact?: boolean; className?: string }) {
  const t = useMessages().books.cover.side;
  return (
    <div role="radiogroup" aria-label={t.aria} className={cn("inline-flex shrink-0 gap-1 bg-cream/80 p-1", compact ? "rounded-xl" : "rounded-2xl", className)}>
      {(["front", "back"] as const).map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={side === s}
          onClick={() => onChange(s)}
          className={cn(
            "inline-flex items-center gap-2 rounded-xl text-sm transition",
            compact ? "h-7 rounded-lg px-2 text-xs" : "min-h-10 px-3 max-lg:min-h-11",
            side === s ? "bg-white font-medium text-ink shadow-soft" : "text-muted hover:text-ink",
          )}
        >
          <span aria-hidden className={cn("shrink-0 rounded-[2px] ring-1", compact ? "h-3.5 w-2.5" : "h-5 w-3.5", side === s ? "bg-wine/15 ring-wine" : "ring-line", s === "back" ? "border-r-[3px] border-r-current" : "border-l-[3px] border-l-current")} />
          {t[s]}
        </button>
      ))}
    </div>
  );
}

/**
 * Обложка целиком, как её развернёт типография: оборот слева, корешок, лицо справа. Выбранная сторона обведена;
 * нажатие по другой — переключает. widths — ширины частей в мм (пропорции).
 */
export function SpreadStrip({
  side,
  onSelect,
  back,
  spine,
  front,
  widths,
  className,
}: {
  side: CoverSide;
  onSelect: (side: CoverSide) => void;
  back: ReactNode;
  spine: ReactNode;
  front: ReactNode;
  widths: { back: number; spine: number; front: number; height: number };
  className?: string;
}) {
  const t = useMessages().books.cover.side;
  const total = widths.back + widths.spine + widths.front;
  const pct = (w: number) => `${(w / total) * 100}%`;
  const part = (s: CoverSide, node: ReactNode, w: number) => (
    <button
      type="button"
      aria-pressed={side === s}
      aria-label={t[s]}
      onClick={() => onSelect(s)}
      className={cn("relative block overflow-hidden outline-offset-2 transition", side === s ? "z-10 ring-2 ring-wine ring-offset-2 ring-offset-paper" : "opacity-90 hover:opacity-100")}
      style={{ width: pct(w), aspectRatio: `${w} / ${widths.height}` }}
    >
      <span className="absolute inset-0 [&>*]:h-full [&>*]:w-full">{node}</span>
    </button>
  );
  return (
    <figure className={className} aria-label={t.spreadAria}>
      <div className="flex items-stretch rounded-[3px] shadow-soft">
        {part("back", back, widths.back)}
        <div aria-hidden className="relative overflow-hidden" style={{ width: pct(widths.spine) }}>
          <span className="absolute inset-0 [&>*]:h-full [&>*]:w-full">{spine}</span>
          <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/25 via-transparent to-black/20" />
        </div>
        {part("front", front, widths.front)}
      </div>
      <figcaption className="mt-2 flex text-[11px] tracking-wide text-muted uppercase">
        <span className={cn("text-center", side === "back" && "font-semibold text-wine")} style={{ width: pct(widths.back) }}>
          {t.back}
        </span>
        <span className="text-center" style={{ width: pct(widths.spine) }} />
        <span className={cn("text-center", side === "front" && "font-semibold text-wine")} style={{ width: pct(widths.front) }}>
          {t.front}
        </span>
      </figcaption>
    </figure>
  );
}

/**
 * Фон оборота в «Шаблон и текст»: «Как спереди» (по умолчанию) или свой цвет — образцы цветов лица первыми.
 * Градиент и остальное — в конструкторе оборота.
 */
export function BackFillSection({
  background,
  likeFront,
  colors,
  editable,
  onChange,
  onMore,
}: {
  background: CoverBackground;
  /** CSS-фон образца «как спереди» — чем оборот залит сейчас без своего цвета. */
  likeFront: string;
  colors: string[];
  editable: boolean;
  onChange: (bg: CoverBackground) => void;
  onMore?: () => void;
}) {
  const t = useMessages().books.cover.backFill;
  const linked = background.kind === "template";
  const own = background.kind === "color" ? background.color : background.kind === "gradient" ? background.from : null;
  const chip = (active: boolean, children: ReactNode, onClick: () => void) => (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={!editable}
      onClick={onClick}
      className={cn("inline-flex min-h-11 items-center gap-2.5 rounded-xl px-3.5 text-sm transition disabled:opacity-60", active ? "bg-rose/40 font-medium text-wine ring-2 ring-wine" : "text-ink-soft ring-1 ring-line hover:ring-ink/30")}
    >
      {children}
    </button>
  );
  return (
    <section className="space-y-4 rounded-2xl border border-line bg-white p-5">
      <h2 className="text-lg font-semibold">{t.title}</h2>
      <div role="radiogroup" aria-label={t.title} className="flex flex-wrap gap-2">
        {chip(
          linked,
          <>
            <span aria-hidden className="size-6 shrink-0 rounded-md ring-1 ring-black/10" style={{ background: likeFront }} />
            <Link2 aria-hidden className="size-4" />
            {t.likeFront}
            {linked ? <Check aria-hidden className="size-4" /> : null}
          </>,
          () => onChange({ kind: "template" }),
        )}
        {chip(
          !linked,
          <>
            <span aria-hidden className="size-6 shrink-0 rounded-md ring-1 ring-black/10" style={{ background: own ?? "conic-gradient(#D9466E, #F3D9A4, #7D8B6A, #1F3A5F, #2B1B2E, #D9466E)" }} />
            {t.own}
            {!linked ? <Check aria-hidden className="size-4" /> : null}
          </>,
          () => onChange({ kind: "color", color: own ?? colors[0] ?? "#1F1A17" }),
        )}
      </div>
      <p className="text-sm text-muted">{linked ? t.likeFrontNote : t.ownNote}</p>
      {!linked && background.kind === "color" && editable ? (
        <div>
          <ColorField label={t.color} value={background.color} swatches={colors} onChange={(c) => c && onChange({ kind: "color", color: c })} />
          <p className="mt-1.5 text-xs text-muted">{t.frontColors}</p>
        </div>
      ) : null}
      {onMore ? (
        <button type="button" className="text-left text-sm text-wine hover:underline" onClick={onMore}>
          {t.more}
        </button>
      ) : null}
    </section>
  );
}

/** Варианты оборота в конструкторе: выбранный раскладывается слоями вместо нынешних (шаг отмены). */
export function BackLayoutsPanel({ onPick, disabled }: { onPick: (layout: BackLayout) => void; disabled?: boolean }) {
  const m = useMessages();
  const t = m.design.cover.backLayouts;
  const names = m.books.cover.back.layouts;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">{t.text}</p>
      <div className="grid grid-cols-3 gap-2 lg:grid-cols-2">
        {backLayouts.map((id) => (
          <button
            key={id}
            type="button"
            disabled={disabled}
            onClick={() => onPick(id)}
            className="flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-center text-ink-soft ring-1 ring-line transition hover:ring-ink/30 disabled:opacity-50"
          >
            <LayoutIcon layout={id} />
            <span className="text-sm font-medium text-ink">{names[id].name}</span>
            <span className="-mt-1 text-xs leading-tight text-muted">{names[id].hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
