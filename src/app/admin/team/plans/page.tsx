import { container } from "@/server/container";
import Link from "next/link";
import { requireStaff } from "@/server/access";
import { adminLabel } from "@/lib/crm";
import { currentMonth, shiftMonth } from "@/modules/sales";
import { formatPrice } from "@/config/site";
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
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/admin/team/plans?m=${shiftMonth(month, -1)}`} className="btn btn-ghost btn-sm">
          ←
        </Link>
        <h2 className="text-lg font-semibold capitalize">{monthName(month)}</h2>
        <Link href={`/admin/team/plans?m=${shiftMonth(month, 1)}`} className="btn btn-ghost btn-sm">
          →
        </Link>
        <span className="ml-auto text-sm text-muted">
          Команда: {formatPrice(total.fact)} из {formatPrice(total.plan)}
          {total.plan ? ` · ${Math.round((total.fact / total.plan) * 100)}%` : ""}
        </span>
      </div>
      <p className="text-sm text-muted">Факт — сумма успешных сделок сотрудника, закрытых в этом месяце. Прогресс виден сотруднику в «Моём дне» и руководителю в аналитике.</p>
      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full min-w-[760px] text-sm" data-testid="plans">
          <thead className="border-b border-line text-left text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Сотрудник</th>
              <th className="px-4 py-3 font-medium">План, ₸</th>
              <th className="px-4 py-3 font-medium">План, сделок</th>
              <th className="px-4 py-3 font-medium">Факт</th>
              <th className="px-4 py-3 font-medium">Выполнение</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {staff.map((s) => {
              const p = progress.get(s.id);
              return (
                <PlanRow
                  key={s.id}
                  month={month}
                  userId={s.id}
                  name={adminLabel(s)}
                  planAmount={p?.planAmount ?? 0}
                  planDeals={p?.planDeals ?? 0}
                  fact={`${formatPrice(p?.factAmount ?? 0)} · ${p?.factDeals ?? 0} сд.`}
                  percent={p?.planAmount ? Math.round(((p.factAmount ?? 0) / p.planAmount) * 100) : null}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
