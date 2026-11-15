import { cn } from "@/lib/class-names";
import { Segmented } from "@/components/admin/Segmented";
import { AutoApply } from "@/components/admin/AutoApply";
import { Alert } from "@/components/ui/Alert";
import type { FinancePeriod } from "@/modules/reporting/ui/finance-screen";

const PRESETS = [
  ["today", "Сегодня"],
  ["7d", "7 дней"],
  ["month", "Месяц"],
  ["prev", "Прошлый месяц"],
] as const;

/** Адрес страницы с периодом: пресет или свои даты, плюс прочие параметры страницы (фильтр, вид). */
export function periodQuery(period: Pick<FinancePeriod, "preset" | "first" | "last">, extra: Record<string, string | undefined> = {}) {
  const params = new URLSearchParams(period.preset === "custom" ? { p: "custom", from: period.first, to: period.last } : { p: period.preset });
  for (const [k, v] of Object.entries(extra)) if (v) params.set(k, v);
  return params.toString();
}

/**
 * Период страницы отчёта — как в «Финансах»: пресеты ссылками и свои даты формой (применяются сразу). path — адрес
 * страницы; extra — её прочие параметры, которые период не должен сбрасывать.
 */
export function PeriodBar({ path, period, extra = {}, bad }: { path: string; period: FinancePeriod; extra?: Record<string, string | undefined>; bad?: boolean }) {
  const kept = Object.entries(extra).filter((e): e is [string, string] => !!e[1]);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented label="Период" items={PRESETS.map(([key, label]) => ({ key, label, href: `${path}?${new URLSearchParams({ p: key, ...Object.fromEntries(kept) })}`, active: period.preset === key }))} />
        <form action={path} className={cn("flex w-full flex-wrap items-center gap-1.5 rounded-[var(--r-ctl)] border bg-white p-0.5 text-sm sm:w-auto sm:flex-nowrap", period.preset === "custom" ? "border-ink" : "border-line")} aria-label="Свой период">
          <input type="hidden" name="p" value="custom" />
          {kept.map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <input type="date" name="from" defaultValue={period.first} className="input min-w-0 flex-1 border-0 px-2.5 text-sm sm:h-[calc(var(--ctl-h-sm)-4px)] sm:w-36 sm:flex-none" aria-label="С даты" />
          <span className="text-muted" aria-hidden>
            –
          </span>
          <input type="date" name="to" defaultValue={period.last} className="input min-w-0 flex-1 border-0 px-2.5 text-sm sm:h-[calc(var(--ctl-h-sm)-4px)] sm:w-36 sm:flex-none" aria-label="По дату" />
          {/* Период применяется, как только выбрана дата (AutoApply); кнопка — для Enter и без JS. */}
          <button className="sr-only">Показать</button>
          <AutoApply />
        </form>
        <span className="text-sm text-muted">{period.label}</span>
      </div>
      {bad ? <Alert kind="warning">Даты не подошли (начало позже конца, будущее или период длиннее года) — показан текущий месяц.</Alert> : null}
    </div>
  );
}
