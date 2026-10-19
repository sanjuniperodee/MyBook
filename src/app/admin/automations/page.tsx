import { container } from "@/server/container";
import { requireStaff } from "@/server/access";
import { staffOptions } from "@/modules/access/ui";
import { formatDate } from "@/lib/dates";
import { AutomationCard } from "./AutomationEditor";
import { getSetting } from "@/modules/workspace";
import { RULE_STATS_DAYS } from "@/modules/reporting";
import { formatPrice } from "@/config/site";
import { parseHolidays } from "@/modules/automation/domain";

export const metadata = { title: "Автоматизации" };

export default async function AutomationsPage() {
  await requireStaff("settings.manage");
  const [rules, stages, admins, holidays, sales] = await Promise.all([
    container().automation.rules.list(),
    container().sales.queries.listStages(),
    container().access.queries.allStaff(),
    getSetting("automation.holidays"),
    container().reporting.automationStats(),
  ]);
  // Повторные продажи правила (contacts-16): у правила, которое создаёт сделки, — даже если за период их нет.
  const salesLabel = (r: (typeof rules)[number]) => {
    const s = sales.get(r.id);
    if (!s && !r.actions.some((a) => a.type === "create_deal")) return null;
    const { created, won, amount } = s ?? { created: 0, won: 0, amount: 0 };
    return `за ${RULE_STATS_DAYS} дней: создано сделок ${created} · выиграно ${won} · оплачено ${formatPrice(amount)}`;
  };
  const pipelines = await container().sales.queries.listPipelines();
  const pname = new Map(pipelines.map((p) => [p.id, p.name]));
  const ctx = {
    stages: stages.map((s) => ({ id: s.id, name: pipelines.length > 1 ? `${pname.get(s.pipelineId)} · ${s.name}` : s.name })),
    staff: staffOptions(admins),
    holidays: parseHolidays(holidays).map((h) => ({ id: h.id, label: `${h.ru} (${h.date.slice(3)}.${h.date.slice(0, 2)})` })),
  };
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Автоматизации</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Цифровая воронка: событие → условие → действия. Например, «пропущенный звонок → задача перезвонить за 15 минут» или «новая заявка → назначить менеджера по кругу». Каждое правило срабатывает для
          объекта один раз.
        </p>
      </div>
      <div className="space-y-3">
        {rules.map((r) => (
          <AutomationCard
            key={r.id}
            rule={{ id: r.id, name: r.name, trigger: r.trigger, conditions: r.conditions, actions: r.actions, active: r.active }}
            stats={{ runs: r.runs, last: r.lastRunAt ? formatDate(r.lastRunAt, true) : null, sales: salesLabel(r) }}
            ctx={ctx}
          />
        ))}
        <AutomationCard rule={null} stats={null} ctx={ctx} />
      </div>
    </div>
  );
}
