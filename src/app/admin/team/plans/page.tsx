import { container } from "@/server/container";
import Link from "next/link";
import { requireStaff } from "@/server/access";
import { staffLabel } from "@/shared/domain/staff";
import { currentMonth, shiftMonth } from "@/modules/sales";
import { formatPrice } from "@/config/site";
import { ChevronLeft, ChevronRight, Target } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatRow, StatTile } from "@/components/admin/charts";
import { PlanRow } from "./PlanRow";

export const metadata = { title: "Планы продаж" };

const monthName = (m: string) => new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`));

export default async function PlansPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  await requireStaff("team.manage");
  const raw = (await searchParams).m;
  const month = raw && /^\d{4}-\d{2}$/.test(raw) ? raw : currentMonth();
  const staff = await container().access.queries.activeStaffList();
  const progress = await container().sales.queries.planProgress(month, staff.map((s) => s.id));
  const total = [...progress.values()].reduce((a, p) => ({ plan: a.plan + p.planAmount, fact: a.fact + p.factAmount, deals: a.deals + p.factDeals, planDeals: a.planDeals + p.planDeals }), { plan: 0, fact: 0, deals: 0, planDeals: 0 });
  const pctTotal = total.plan ? Math.round((total.fact / total.plan) * 100) : null;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1" role="group" aria-label="Месяц">
          <Link href={`/admin/team/plans?m=${shiftMonth(month, -1)}`} className="btn btn-outline btn-icon btn-sm" aria-label="Прошлый месяц">
            <ChevronLeft className="size-4" strokeWidth={1.8} />
          </Link>
          <h2 className="min-w-44 text-center text-[15px] font-semibold first-letter:uppercase">{monthName(month)}</h2>
          <Link href={`/admin/team/plans?m=${shiftMonth(month, 1)}`} className="btn btn-outline btn-icon btn-sm" aria-label="Следующий месяц">
            <ChevronRight className="size-4" strokeWidth={1.8} />
          </Link>
        </div>
        {month !== currentMonth() ? (
          <Link href="/admin/team/plans" className="btn btn-ghost btn-sm">
            К текущему месяцу
          </Link>
        ) : null}
      </div>
      <StatRow cols={4}>
        <StatTile bare label="План команды" value={formatPrice(total.plan)} hint={total.planDeals ? `${total.planDeals} сделок` : "план не задан"} />
        <StatTile bare label="Факт" value={formatPrice(total.fact)} hint={`${total.deals} сделок`} />
        <StatTile bare label="Выполнение" value={pctTotal === null ? "—" : `${pctTotal}%`} hint={pctTotal === null ? "нет плана" : pctTotal >= 100 ? "план выполнен" : `осталось ${formatPrice(Math.max(0, total.plan - total.fact))}`} />
        <StatTile bare label="Сотрудников" value={String(staff.length)} hint="активных" />
      </StatRow>
      <Panel flush title="План по сотрудникам" description="Факт — успешные сделки сотрудника, закрытые в этом месяце, и деньги по его ручным сделкам (предоплата — с первого платежа). Прогресс виден в «Моём дне» и в аналитике">
        {staff.length === 0 ? (
          <EmptyState compact icon={Target} title="Нет активных сотрудников">
            Добавьте сотрудника во вкладке «Сотрудники», затем задайте ему план.
          </EmptyState>
        ) : (
          <div className="lg:overflow-x-auto">
            <table className="table max-lg:block lg:min-w-[760px]" data-testid="plans">
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
        )}
      </Panel>
    </div>
  );
}
