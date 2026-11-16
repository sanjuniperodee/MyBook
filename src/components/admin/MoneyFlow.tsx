import Link from "next/link";
import { formatPrice } from "@/config/site";
import { cn } from "@/lib/class-names";
import type { ProfitScreen } from "@/modules/reporting/ui/profit-screen";

const signed = (n: number) => (n < 0 ? `−${formatPrice(-n)}` : formatPrice(n));

/**
 * «Деньги за период» одной строкой — одинаковая на «Финансах», «Прибыли» и «Аналитике продаж», за тот же период и из тех
 * же денег: пришло от клиентов − возвраты − комиссии Kaspi − налог = на счёт; на счёт − остальные расходы = прибыль.
 * Каждая цифра ведёт на страницу, где она расписана. query — параметры периода (?p=… или свои даты).
 */
export function MoneyFlow({ flow, taxRate, query, label }: { flow: ProfitScreen["flow"]; taxRate: number; query: string; label?: string }) {
  const cells: { sign?: "−" | "="; title: string; value: number; hint: string; href: string; strong?: boolean; result?: boolean }[] = [
    { title: "Пришло от клиентов", value: flow.incoming, hint: "все оплаты за период", href: `/admin/finance?${query}#received` },
    { sign: "−", title: "Возвраты", value: flow.refunds, hint: "вернули клиентам", href: `/admin/finance?${query}#received` },
    { sign: "−", title: "Комиссии Kaspi", value: flow.fees, hint: "рассрочка, Red, % с продажи", href: `/admin/profit?${query}` },
    { sign: "−", title: taxRate ? `Налог ${String(taxRate).replace(".", ",")}%` : "Налог", value: flow.tax, hint: taxRate ? "с выручки периода" : "ставка не задана", href: `/admin/profit?${query}` },
    { sign: "=", title: "На счёт", value: flow.net, hint: "после комиссий и налога", href: `/admin/profit?${query}`, strong: true },
    { sign: "−", title: "Остальные расходы", value: flow.other, hint: "печать, реклама, команда…", href: `/admin/expenses?${query}` },
    { sign: "=", title: "Прибыль", value: flow.profit, hint: "что осталось", href: `/admin/profit?${query}`, strong: true, result: true },
  ];
  return (
    <section aria-label={label ?? "Деньги за период"} className="panel overflow-hidden" data-testid="money-flow">
      <ol className="grid grid-cols-2 divide-line sm:grid-cols-4 xl:grid-cols-7 xl:divide-x [&>li]:border-b [&>li]:border-line xl:[&>li]:border-b-0">
        {cells.map((c) => (
          <li key={c.title} className={cn("min-w-0", c.result && "bg-sunken/60", c.strong && !c.result && "bg-sunken/30")}>
            <Link href={c.href} className="block h-full px-4 py-3 transition-colors hover:bg-sunken/70 sm:px-5">
              <div className="flex items-baseline gap-1.5 text-[13px] text-muted">
                {c.sign ? <span className="font-semibold text-ink-soft" aria-hidden>{c.sign}</span> : null}
                <span className="truncate">{c.title}</span>
              </div>
              <div className={cn("mt-1 text-xl leading-tight tracking-[-0.02em] whitespace-nowrap tabular-nums", c.strong ? "font-semibold" : "font-medium", c.result && c.value < 0 && "text-danger")}>
                {c.sign === "−" && c.value > 0 ? `−${formatPrice(c.value)}` : signed(c.value)}
              </div>
              <div className="mt-0.5 truncate text-xs text-muted">{c.hint}</div>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
