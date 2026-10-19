import { formatPrice } from "@/config/site";
import { cn } from "@/lib/class-names";

export interface FinanceDay {
  date: string; // YYYY-MM-DD, день магазина
  incoming: number;
  refunds: number;
  count: number;
}

/** «Красивый» шаг шкалы: 1, 2, 2.5, 5 × 10ⁿ. */
function niceStep(raw: number) {
  if (raw <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
}

const compact = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0).replace(".", ",")} млн` : n >= 1000 ? `${Math.round(n / 1000)} тыс` : String(n));
const dayLabel = (d: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("ru-RU", { ...opts, timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
const receipts = (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? "поступление" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "поступления" : "поступлений"}`;

/**
 * Поступления по дням (столбцы, как «Выручка по дням» в обзоре): одна серия — деньги, пришедшие за день; возвраты — в
 * подсказке и таблице. Подсказка — при наведении на день; таблица-дубль в <details> для доступности.
 */
export function FinanceColumns({ data, height = 200 }: { data: FinanceDay[]; height?: number }) {
  const max = Math.max(...data.map((d) => d.incoming), 0);
  const step = niceStep(max / 4 || 1);
  const top = step * 4;
  const ticks = [0, 1, 2, 3, 4].map((i) => i * step);
  const labelEvery = Math.ceil(data.length / 8);
  return (
    <div className="pt-2">
      <div className="flex gap-3">
        <div className="relative w-14 shrink-0 text-right text-[11px] text-muted tabular-nums" style={{ height }}>
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
            {data.map((d, i) => (
              <div key={d.date} className="group relative flex h-full flex-1 items-end justify-center px-[1px]" tabIndex={0} aria-label={`${dayLabel(d.date, { day: "numeric", month: "long" })}: ${formatPrice(d.incoming)}`}>
                <div className="absolute inset-0 rounded-md group-hover:bg-ink/[0.04] group-focus:bg-ink/[0.04]" />
                {d.incoming > 0 ? <div className="relative w-full max-w-6 rounded-t-[4px] bg-wine transition group-hover:bg-wine-dark" style={{ height: `${Math.max((d.incoming / top) * 100, 1.2)}%` }} /> : null}
                {d.refunds > 0 ? <div className="absolute bottom-0 h-1 w-full max-w-6 rounded-full bg-red-600" title="возврат" /> : null}
                <div className={cn("pointer-events-none absolute bottom-full z-10 mb-2 hidden w-max rounded-xl bg-ink px-3 py-2 text-xs text-white shadow-lift group-hover:block group-focus:block", i > data.length * 0.7 ? "right-0" : "left-0")}>
                  <div className="text-white/60">{dayLabel(d.date, { weekday: "short", day: "numeric", month: "long" })}</div>
                  <div className="mt-0.5 font-semibold">{formatPrice(d.incoming)}</div>
                  <div className="text-white/60">{receipts(d.count)}</div>
                  {d.refunds ? <div className="text-red-300">возвраты −{formatPrice(d.refunds)}</div> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-2 ml-[4.25rem] flex text-[11px] text-muted">
        {data.map((d, i) => (
          <div key={d.date} className="flex-1 text-center whitespace-nowrap">
            {i % labelEvery === 0 ? dayLabel(d.date, { day: "numeric", month: "short" }).replace(".", "") : ""}
          </div>
        ))}
      </div>
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-xs text-muted hover:text-ink">Показать таблицей</summary>
        <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-line">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white text-left text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Дата</th>
                <th className="px-3 py-2 text-right font-medium">Поступлений</th>
                <th className="px-3 py-2 text-right font-medium">Пришло</th>
                <th className="px-3 py-2 text-right font-medium">Возвраты</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line tabular-nums">
              {[...data].reverse().map((d) => (
                <tr key={d.date}>
                  <td className="px-3 py-1.5">{dayLabel(d.date, { day: "numeric", month: "long" })}</td>
                  <td className="px-3 py-1.5 text-right">{d.count}</td>
                  <td className="px-3 py-1.5 text-right">{formatPrice(d.incoming)}</td>
                  <td className="px-3 py-1.5 text-right">{d.refunds ? `−${formatPrice(d.refunds)}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
