import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { formatPrice } from "@/config/site";
import { cn } from "@/lib/class-names";

/** «Красивый» шаг шкалы: 1, 2, 2.5, 5 × 10ⁿ. */
function niceStep(raw: number) {
  if (raw <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * pow;
}

function compact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0).replace(".", ",")} млн`;
  if (n >= 1000) return `${Math.round(n / 1000)} тыс`;
  return String(n);
}

export interface DayPoint {
  date: string; // YYYY-MM-DD
  value: number;
  count: number;
}

const dayLabel = (d: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("ru-RU", { ...opts, timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

/**
 * Столбчатая диаграмма выручки по дням. Одна серия — без легенды: заголовок карточки говорит, что показано.
 * Подсказка при наведении на весь столбец дня; таблица-дубль в <details> для доступности.
 */
export function RevenueColumns({ data, height = 220 }: { data: DayPoint[]; height?: number }) {
  const max = Math.max(...data.map((d) => d.value), 0);
  const step = niceStep(max / 4 || 1);
  const top = Math.max(step * 4, step);
  const ticks = [0, 1, 2, 3, 4].map((i) => i * step).filter((t) => t <= top);
  // Подписи дат — не чаще шести: на телефоне восемь подписей слипались.
  const labelEvery = Math.ceil(data.length / 6);

  return (
    <div className="pt-2">
      <div className="flex gap-3">
        {/* ось Y */}
        <div className="relative w-11 shrink-0 text-right sm:w-14 text-[11px] text-muted tabular-nums" style={{ height }}>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ bottom: `${(t / top) * 100}%` }}>
              {compact(t)}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1" style={{ height }}>
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 h-px bg-line/80" style={{ bottom: `${(t / top) * 100}%` }} />
          ))}
          <div className="absolute inset-0 flex items-end">
            {data.map((d, i) => {
              const h = top ? (d.value / top) * 100 : 0;
              const alignRight = i > data.length * 0.7;
              return (
                <div key={d.date} className="group relative flex h-full flex-1 items-end justify-center px-[1px]" tabIndex={0} aria-label={`${dayLabel(d.date, { day: "numeric", month: "long" })}: ${formatPrice(d.value)}`}>
                  <div className="absolute inset-x-0 inset-y-0 rounded-md group-hover:bg-ink/[0.04] group-focus:bg-ink/[0.04]" />
                  {d.value > 0 ? (
                    <div className="relative w-full max-w-6 rounded-t-[4px] bg-wine transition group-hover:bg-wine-dark" style={{ height: `${Math.max(h, 1.2)}%` }} />
                  ) : null}
                  <div
                    className={cn(
                      "pointer-events-none absolute bottom-full z-10 mb-2 hidden w-max rounded-[10px] bg-ink px-3 py-2 text-xs text-white shadow-lift group-hover:block group-focus:block",
                      alignRight ? "right-0" : "left-0",
                    )}
                  >
                    <div className="text-white/60">{dayLabel(d.date, { weekday: "short", day: "numeric", month: "long" })}</div>
                    <div className="mt-0.5 font-semibold">{formatPrice(d.value)}</div>
                    <div className="text-white/60">
                      {d.count} {d.count === 1 ? "заказ" : d.count >= 2 && d.count <= 4 ? "заказа" : "заказов"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {/* ось X */}
      <div className="mt-2 ml-[3.5rem] flex sm:ml-[4.25rem] text-[11px] text-muted">
        {data.map((d, i) => (
          <div key={d.date} className="flex-1 text-center whitespace-nowrap">
            {i % labelEvery === 0 ? dayLabel(d.date, { day: "numeric", month: "short" }).replace(".", "") : ""}
          </div>
        ))}
      </div>
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-xs text-muted hover:text-ink">Показать таблицей</summary>
        <div className="mt-2 max-h-64 overflow-y-auto rounded-[10px] border border-line">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white text-left text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Дата</th>
                <th className="px-3 py-2 text-right font-medium">Заказов</th>
                <th className="px-3 py-2 text-right font-medium">Выручка</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line tabular-nums">
              {[...data].reverse().map((d) => (
                <tr key={d.date}>
                  <td className="px-3 py-1.5">{dayLabel(d.date, { day: "numeric", month: "long" })}</td>
                  <td className="px-3 py-1.5 text-right">{d.count}</td>
                  <td className="px-3 py-1.5 text-right">{formatPrice(d.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

/** Горизонтальные полосы (воронка, тарифы): одна серия, значение текстом у конца полосы. */
export function BarList({ rows, format = (n) => n.toLocaleString("ru-RU") }: { rows: { label: string; value: number; note?: string }[]; format?: (n: number) => string }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-ink-soft">{r.label}</span>
            <span className="shrink-0 tabular-nums">
              <span className="font-medium text-ink">{format(r.value)}</span>
              {r.note ? <span className="ml-1.5 text-xs text-muted">{r.note}</span> : null}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-sunken">
            <div className="h-full rounded-full bg-wine" style={{ width: `${r.value ? Math.max((r.value / max) * 100, 1.5) : 0}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Показатель: подпись, значение, изменение к прошлому периоду. Отдельно — лист с рамкой; внутри StatRow — без рамки
 * (bare), и несколько показателей читаются одной строкой, а не сеткой одинаковых карточек.
 */
export function StatTile({ label, value, delta, goodWhenUp = true, hint, bare, href }: { label: string; value: string; delta?: number | null; goodWhenUp?: boolean; hint?: string; bare?: boolean; href?: string }) {
  const hasDelta = delta !== undefined && delta !== null && Number.isFinite(delta);
  const up = hasDelta && delta! > 0;
  const good = hasDelta && (delta === 0 ? null : up === goodWhenUp);
  const body = (
    <>
      <div className="text-[13px] text-muted">{label}</div>
      <div className="mt-1 text-2xl leading-tight font-semibold tracking-[-0.02em] tabular-nums">{value}</div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
        {hasDelta ? (
          <span className={cn("inline-flex items-center gap-0.5 font-semibold tabular-nums", good === null ? "text-muted" : good ? "text-success" : "text-danger")}>
            {delta! > 0 ? <ArrowUpRight className="size-3.5" aria-hidden /> : delta! < 0 ? <ArrowDownRight className="size-3.5" aria-hidden /> : null}
            {delta! < 0 ? "−" : ""}
            {Math.abs(Math.round(delta! * 100))}%
          </span>
        ) : null}
        <span className="text-muted">{hint ?? (hasDelta ? "к прошлому периоду" : "")}</span>
      </div>
    </>
  );
  const cls = cn(bare ? "bg-white p-4 sm:p-5" : "panel p-4 sm:p-5", href && "block transition-colors hover:bg-sunken/60");
  return href ? (
    <a href={href} className={cls}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/**
 * Строка показателей одним листом: тонкие разделители между ячейками (через gap-px на фоне линии) при любом переносе
 * сетки. cols — сколько в ряд на широком экране (на телефоне — по 2).
 */
export function StatRow({ children, cols = 4, className }: { children: React.ReactNode; cols?: 2 | 3 | 4 | 5; className?: string }) {
  const grid = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-2 xl:grid-cols-4", 5: "sm:grid-cols-3 xl:grid-cols-5" }[cols];
  return <div className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-[var(--r-panel)] border border-line bg-line", grid, className)}>{children}</div>;
}
