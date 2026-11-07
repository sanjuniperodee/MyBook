import { cn } from "@/lib/class-names";

/**
 * Локальный кит ведомостей для аналитики, маркетинга, звонков, промокодов и ИИ-дизайнера (группа G3). Предложение в общий
 * кит: ShareBar и InlineStats нужны любой странице с ведомостью — доля полосой внутри строки и строка показателей без плиток.
 */

/** Тонкая полоса доли внутри строки ведомости: value от max; пустая — только дорожка. */
export function ShareBar({ value, max, className, tone = "wine" }: { value: number; max: number; className?: string; tone?: "wine" | "success" | "info" | "muted" }) {
  const w = max > 0 && value > 0 ? Math.max((value / max) * 100, 2) : 0;
  const color = { wine: "bg-wine/80", success: "bg-success/80", info: "bg-info/80", muted: "bg-line-strong" }[tone];
  return (
    <div className={cn("h-1 overflow-hidden rounded-full bg-sunken", className)} aria-hidden>
      <div className={cn("h-full rounded-full", color)} style={{ width: `${w}%` }} />
    </div>
  );
}

/** Число и под ним полоса доли — ячейка «Выручка» и подобные. */
export function BarCell({ value, max, children, align = "right" }: { value: number; max: number; children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <div className={cn("flex min-w-24 flex-col gap-1", align === "right" ? "items-end" : "items-start")}>
      <span className="font-medium whitespace-nowrap">{children}</span>
      <ShareBar value={value} max={max} className="w-full max-w-28" />
    </div>
  );
}

export interface InlineStat {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  href?: string;
  tone?: "danger" | "success";
}

/**
 * Строка показателей без рамок-плиток: подпись, число, пояснение; ячейки разделены линией. Для узких полос над ведомостью
 * (звонки, промокоды), где крупные плитки StatRow заслонили бы сам список.
 */
export function InlineStats({ items, className }: { items: InlineStat[]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-[var(--r-panel)] border border-line bg-line sm:flex", className)}>
      {items.map((it) => {
        const body = (
          <>
            <dt className="text-xs text-muted">{it.label}</dt>
            <dd className={cn("mt-0.5 text-lg leading-tight font-semibold tracking-[-0.01em] tabular-nums", it.tone === "danger" && "text-danger", it.tone === "success" && "text-success")}>{it.value}</dd>
            {it.hint ? <dd className="mt-0.5 text-xs text-muted">{it.hint}</dd> : null}
          </>
        );
        const cls = "min-w-0 bg-white px-4 py-3 sm:flex-1";
        return it.href ? (
          <a key={it.label} href={it.href} className={cn(cls, "block transition-colors hover:bg-sunken/60")}>
            {body}
          </a>
        ) : (
          <div key={it.label} className={cls}>
            {body}
          </div>
        );
      })}
    </dl>
  );
}

/** Колонки по дням: высота — доля от максимума, подпись и значение — в подсказке и для экранного диктора. */
export function DayBars({ data, height = 96 }: { data: { key: string; label: string; value: number; note?: string }[]; height?: number }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-1" style={{ height }} role="img" aria-label={`По дням: ${data.map((d) => `${d.label} ${d.value}`).join(", ")}`}>
      {data.map((d) => (
        <div key={d.key} className="group/day relative flex h-full min-w-0 flex-1 items-end">
          <div className="w-full rounded-t-[3px] bg-wine/75 transition-colors group-hover/day:bg-wine" style={{ height: `${d.value ? Math.max((d.value / max) * 100, 4) : 0}%` }} />
          <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 rounded-[var(--r-ctl)] bg-ink px-2 py-1 text-xs whitespace-nowrap text-white shadow-soft group-hover/day:block">
            {d.label}: {d.value}
            {d.note ? `, ${d.note}` : ""}
          </div>
        </div>
      ))}
    </div>
  );
}
