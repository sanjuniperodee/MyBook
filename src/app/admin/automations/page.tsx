import { container } from "@/server/container";
import { requireStaff } from "@/server/access";
import { staffOptions } from "@/modules/access/ui";
import { formatDate } from "@/lib/dates";
import { ChevronRight, Zap } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/admin/PageHeader";
import { Badge } from "@/components/ui/Badge";
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
    return `за ${RULE_STATS_DAYS} дней: создано сделок ${created}, выиграно ${won}, оплачено ${formatPrice(amount)}`;
  };
  const pipelines = await container().sales.queries.listPipelines();
  const pname = new Map(pipelines.map((p) => [p.id, p.name]));
  const ctx = {
    stages: stages.map((s) => ({ id: s.id, name: pipelines.length > 1 ? `${pname.get(s.pipelineId)} · ${s.name}` : s.name, open: s.kind === "open" })),
    staff: staffOptions(admins),
    holidays: parseHolidays(holidays).map((h) => ({ id: h.id, label: `${h.ru} (${h.date.slice(3)}.${h.date.slice(0, 2)})` })),
  };
  const card = (r: (typeof rules)[number]) => (
    <AutomationCard
      key={r.id}
      rule={{ id: r.id, name: r.name, trigger: r.trigger, conditions: r.conditions, actions: r.actions, active: r.active }}
      stats={{ runs: r.runs, last: r.lastRunAt ? formatDate(r.lastRunAt, true) : null, sales: salesLabel(r) }}
      ctx={ctx}
    />
  );
  const on = rules.filter((r) => r.active);
  const off = rules.filter((r) => !r.active);
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader title="Автоматизации" meta={<Badge tone={on.length ? "success" : "neutral"} dot>{on.length ? `работают ${on.length}` : "ни одно не работает"}</Badge>}>
        Цифровая воронка: событие → условие → действия. Например, «пропущенный звонок → задача перезвонить за 15 минут» или «новая заявка → назначить менеджера по кругу». Каждое правило срабатывает для
        объекта один раз.
      </PageHeader>
      <section aria-labelledby="on-h" className="space-y-3">
        <h2 id="on-h" className="text-lg font-semibold">
          Работают <span className="font-normal text-muted tabular-nums">{on.length}</span>
        </h2>
        {on.length ? (
          <div className="panel divide-y divide-line overflow-hidden">{on.map(card)}</div>
        ) : (
          <div className="panel">
            <EmptyState compact icon={Zap} title={off.length ? "Все правила выключены" : "Правил пока нет"}>
              Начните с простого: пропущенный звонок — задача перезвонить; новая заявка — назначить менеджера по кругу.
            </EmptyState>
          </div>
        )}
        <AutomationCard rule={null} stats={null} ctx={ctx} />
      </section>
      {off.length ? (
        <details className="group space-y-3">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-lg font-semibold marker:hidden [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-4 text-muted transition-transform group-open:rotate-90" aria-hidden />
            Выключены <span className="font-normal text-muted tabular-nums">{off.length}</span>
          </summary>
          <div className="panel mt-3 divide-y divide-line overflow-hidden">{off.map(card)}</div>
        </details>
      ) : null}
    </div>
  );
}
