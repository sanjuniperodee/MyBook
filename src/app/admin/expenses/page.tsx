import Link from "next/link";
import { z } from "zod";
import { Download, ReceiptText } from "lucide-react";
import { can, requireStaff } from "@/server/access";
import { storeTimeZone } from "@/shared/domain/time";
import { channels } from "@/shared/domain/channels";
import { formatPrice } from "@/config/site";
import { BarList, StatRow, StatTile } from "@/components/admin/charts";
import { cn } from "@/lib/class-names";
import { PageHeader } from "@/components/admin/PageHeader";
import { PeriodBar, periodQuery } from "@/components/admin/PeriodBar";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { financePeriod } from "@/modules/reporting/ui/finance-screen";
import { expensesScreen } from "@/modules/reporting/ui/profit-screen";
import { expenseGroupKeys, expenseGroupOf, expenseGroups } from "@/shared/domain/expenses";
import { AddExpenseButton, ExpenseRowActions, PasteExpensesButton } from "./ExpenseControls";
import { crmRead } from "@/server/v1-local-bridge-crm";

export const metadata = { title: "Расходы" };

const query = z.object({ p: z.string().max(10).optional(), from: z.string().max(10).optional(), to: z.string().max(10).optional() }).catch({});

const EDGE = "[&_td:first-child]:pl-4 [&_th:first-child]:pl-4 sm:[&_td:first-child]:pl-5 sm:[&_th:first-child]:pl-5 [&_td:last-child]:pr-4 [&_th:last-child]:pr-4 sm:[&_td:last-child]:pr-5 sm:[&_th:last-child]:pr-5";
const plural = (n: number, forms: [string, string, string]) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? forms[0] : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? forms[1] : forms[2]}`;
const shortDay = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;

/**
 * «Расходы» — ведомость (DESIGN.md §7.2): на что ушли деньги за период. Сверху — добавить расход или вставить список из
 * таблицы; затем сумма и группы одной строкой, расходы по категориям и все записи с правкой и удалением. Реклама видна
 * здесь же, но хранится в расходах по каналам маркетинга. Видят сотрудники с правом «Видеть расходы и прибыль»,
 * меняют — с правом «Вести расходы».
 */
export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requireStaff("finance.view");
  const q = query.parse(await searchParams);
  const period = financePeriod({ preset: q.p, from: q.from, to: q.to, now: new Date(), tz: storeTimeZone() });
  const { rows, admins } = await crmRead("money.expenses", { p: q.p, from: q.from, to: q.to });
  const s = expensesScreen({ period, expenses: rows, staff: admins });
  const manage = can(staff, "finance.manage");
  const channelList = Object.entries(channels).map(([key, label]) => ({ key, label }));
  const groups = expenseGroupKeys.map((key) => ({ key, label: expenseGroups[key], value: s.rows.filter((r) => expenseGroupOf(r.category) === key).reduce((sum, r) => sum + r.amount, 0) }));

  return (
    <div className="flex flex-col gap-5 lg:gap-6">
      <PageHeader
        title="Расходы"
        actions={
          <>
            {s.rows.length ? (
              <a href={`/api/admin/export/expenses?${periodQuery(period)}`} className="btn btn-outline btn-sm" data-testid="expenses-export">
                <Download className="size-4" strokeWidth={1.8} aria-hidden /> Скачать CSV
              </a>
            ) : null}
            {manage ? (
              <>
                <PasteExpensesButton />
                <AddExpenseButton channels={channelList} />
              </>
            ) : null}
          </>
        }
      >
        Всё, на что ушли деньги: печать, доставка, зарплата, реклама. По этим записям считается{" "}
        <Link href={`/admin/profit?${periodQuery(period)}`} className="text-wine hover:underline">
          прибыль
        </Link>
        .
      </PageHeader>

      <PeriodBar path="/admin/expenses" period={period} bad={q.p === "custom" && period.preset !== "custom"} />

      <section aria-label="Итоги расходов" data-testid="expenses-totals">
        <StatRow cols={5} className="max-sm:[&>*:last-child:nth-child(odd)]:col-span-2 sm:max-xl:[&>*:last-child]:col-span-2">
          <StatTile bare label="Всего расходов" value={formatPrice(s.total)} hint={s.rows.length ? plural(s.rows.length, ["запись", "записи", "записей"]) : "за период — нет"} />
          {groups.map((g) => (
            <StatTile key={g.key} bare label={g.label} value={formatPrice(g.value)} hint={s.total ? `${Math.round((g.value / s.total) * 100)}% расходов` : undefined} />
          ))}
        </StatRow>
      </section>

      {s.rows.length ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,5fr)] xl:items-start">
          <Panel title="По категориям">
            <BarList format={formatPrice} rows={s.byCategory.map((r) => ({ label: r.label, value: r.value, note: `${r.count} шт.` }))} />
          </Panel>
          <Panel flush title="Записи" description={`${plural(s.rows.length, ["расход", "расхода", "расходов"])} на ${formatPrice(s.total)}`}>
            <div className="hidden overflow-x-auto lg:block">
              <table className={cn("table min-w-[760px]", EDGE)} data-testid="expenses-table">
                <thead>
                  <tr>
                    <th>День</th>
                    <th>Категория</th>
                    <th>Что</th>
                    <th className="num">Сумма</th>
                    <th>Внёс</th>
                    {manage ? <th aria-label="Действия" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {s.rows.map((r) => (
                    <tr key={`${r.source}:${r.id}`}>
                      <td className="whitespace-nowrap text-muted tabular-nums">{shortDay(r.day)}</td>
                      <td className="whitespace-nowrap">{r.label}</td>
                      <td>
                        {r.name}
                        {r.quantity ? <span className="text-muted">, {r.quantity} шт. по {formatPrice(Math.round(r.amount / r.quantity))}</span> : null}
                        {r.note ? <span className="block text-xs text-muted">{r.note}</span> : null}
                      </td>
                      <td className="num font-medium whitespace-nowrap">{formatPrice(r.amount)}</td>
                      <td className="text-muted">{r.by || "—"}</td>
                      {manage ? (
                        <td>
                          <ExpenseRowActions source={r.source} channels={channelList} value={{ id: r.id, day: r.day, category: r.category, title: r.title, amount: r.amount, quantity: r.quantity, note: r.note }} />
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-line lg:hidden">
              {s.rows.map((r) => (
                <li key={`${r.source}:${r.id}`} className="flex items-start gap-3 px-4 py-3 text-sm">
                  <span className="w-11 shrink-0 text-muted tabular-nums">{shortDay(r.day)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block">{r.name}</span>
                    <span className="block text-xs text-muted">
                      {r.label}
                      {r.quantity ? `, ${r.quantity} шт.` : ""}
                      {r.note ? ` — ${r.note}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-medium tabular-nums">{formatPrice(r.amount)}</span>
                    {manage ? <ExpenseRowActions source={r.source} channels={channelList} value={{ id: r.id, day: r.day, category: r.category, title: r.title, amount: r.amount, quantity: r.quantity, note: r.note }} /> : null}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      ) : (
        <div className="panel">
          <EmptyState icon={ReceiptText} title="За период расходов нет">
            {manage ? "Добавьте расход кнопкой сверху или вставьте список из своей таблицы: строки «название сумма» распознаются сами." : "Расходы вносит сотрудник с правом «Вести расходы»."}
          </EmptyState>
        </div>
      )}
    </div>
  );
}
