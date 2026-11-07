import { container } from "@/server/container";
import Link from "next/link";
import { requireStaff } from "@/server/access";
import { staffLabel } from "@/shared/domain/staff";
import { currentMonth, shiftMonth } from "@/modules/sales";
import { formatPrice } from "@/config/site";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { cn } from "@/lib/class-names";
import { PlanRow } from "./PlanRow";

export const metadata = { title: "Планы продаж" };

const monthName = (m: string) => new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`));

export default async function PlansPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  await requireStaff("team.manage");
  const raw = (await searchParams).m;
  const month = raw && /^\d{4}-\d{2}$/.test(raw) ? raw : currentMonth();
  const staff = await container().access.queries.activeStaffList();
  const progress = await container().sales.queries.planProgress(month, staff.map((s) => s.id));
  const total = [...progress.values()].reduce((a, p) => ({ plan: a.plan + p.planAmount, fact: a.fact + p.factAmount }), { plan: 0, fact: 0 });
  const pctTotal = total.plan ? Math.round((total.fact / total.plan) * 100) : null;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex items-center gap-1">
          <Link href={`/admin/team/plans?m=${shiftMonth(month, -1)}`} className="btn btn-ghost btn-icon btn-sm" aria-label="Прошлый месяц">
            <ChevronLeft className="size-4" strokeWidth={1.8} />
          </Link>
          <h2 className="min-w-40 text-center text-lg font-semibold first-letter:uppercase">{monthName(month)}</h2>
          <Link href={`/admin/team/plans?m=${shiftMonth(month, 1)}`} className="btn btn-ghost btn-icon btn-sm" aria-label="Следующий месяц">
            <ChevronRight className="size-4" strokeWidth={1.8} />
          </Link>
        </div>
        <div className="flex min-w-60 flex-1 items-center gap-3 lg:ml-auto lg:max-w-md">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken" aria-hidden>
            <div className={cn("h-full rounded-full", pctTotal !== null && pctTotal >= 100 ? "bg-success" : "bg-wine")} style={{ width: `${Math.min(100, pctTotal ?? 0)}%` }} />
          </div>
          <span className="text-sm whitespace-nowrap tabular-nums">
            <b className="font-semibold">{formatPrice(total.fact)}</b> <span className="text-muted">из {formatPrice(total.plan)}</span>
            {pctTotal !== null ? <span className="badge ml-1.5">{pctTotal}%</span> : null}
          </span>
        </div>
      </div>
      <Panel flush title="Планы сотрудников" description="Факт — успешные сделки сотрудника, закрытые в этом месяце, и деньги по его ручным сделкам (предоплата — с первого платежа). Прогресс виден в «Моём дне» и в аналитике">
        <div className="lg:overflow-x-auto">
          <table className="table max-lg:block lg:min-w-[760px] lg:[&_td:first-child]:pl-5 lg:[&_th:first-child]:pl-5 lg:[&_td:last-child]:pr-5 lg:[&_th:last-child]:pr-5" data-testid="plans">
            <thead className="max-lg:hidden">
              <tr>
                <th>Сотрудник</th>
                <th>План, ₸</th>
                <th>План, сделок</th>
                <th>Факт</th>
                <th>Выполнение</th>
              </tr>
            </thead>
            <tbody className="max-lg:block max-lg:divide-y max-lg:divide-line">
              {staff.map((s) => {
                const p = progress.get(s.id);
                return (
                  <PlanRow
                    key={s.id}
                    month={month}
                    userId={s.id}
                    name={staffLabel(s)}
                    planAmount={p?.planAmount ?? 0}
                    planDeals={p?.planDeals ?? 0}
                    fact={`${formatPrice(p?.factAmount ?? 0)}, ${p?.factDeals ?? 0} сд.`}
                    percent={p?.planAmount ? Math.round(((p.factAmount ?? 0) / p.planAmount) * 100) : null}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
