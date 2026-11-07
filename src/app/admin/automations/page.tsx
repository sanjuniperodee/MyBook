import { container } from "@/server/container";
import { requireStaff } from "@/server/access";
import { staffOptions } from "@/modules/access/ui";
import { formatDate } from "@/lib/dates";
import { Zap } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/admin/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { AutomationRow, NewRuleButton } from "./AutomationEditor";
import { InlineStats } from "@/components/admin/bars";
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
  const row = (r: (typeof rules)[number]) => (
    <AutomationRow
      key={r.id}
      rule={{ id: r.id, name: r.name, trigger: r.trigger, conditions: r.conditions, actions: r.actions, active: r.active }}
      stats={{ runs: r.runs, last: r.lastRunAt ? formatDate(r.lastRunAt, true) : null, sales: salesLabel(r) }}
      ctx={ctx}
    />
  );
  const on = rules.filter((r) => r.active);
  const off = rules.filter((r) => !r.active);
  const runs = rules.reduce((a, r) => a + r.runs, 0);
  const band = (title: string, n: number) => (
    <h2 className="flex items-center gap-2 border-y border-line bg-sunken/60 px-4 py-1.5 text-[13px] font-semibold text-ink-soft first:border-t-0 sm:px-5">
      {title} <span className="count">{n}</span>
    </h2>
  );
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Автоматизации"
        actions={<NewRuleButton ctx={ctx} />}
        meta={<Badge tone={on.length ? "success" : "neutral"} dot>{on.length ? `работают ${on.length}` : "ни одно не работает"}</Badge>}
      >
        Цифровая воронка: событие, условие, действия. Например, «пропущенный звонок — задача перезвонить за 15 минут» или «новая заявка — назначить менеджера по кругу». Каждое правило срабатывает для
        объекта один раз.
      </PageHeader>
      {rules.length ? (
        <InlineStats
          items={[
            { label: "Правил", value: rules.length },
            { label: "Работают", value: on.length, tone: on.length ? "success" : undefined },
            { label: "Выключены", value: off.length },
            { label: "Срабатываний", value: runs, hint: "за всё время" },
          ]}
        />
      ) : null}
      <section className="panel overflow-hidden" aria-label="Правила автоматизации">
        {rules.length ? (
          <div className="hidden grid-cols-[7.5rem_minmax(0,1fr)_12rem_auto] gap-x-4 border-b border-line bg-sunken/70 px-5 py-2 text-xs font-medium text-muted lg:grid">
            <span>Статус</span>
            <span>Правило: когда и что делает</span>
            <span>Запуски</span>
            <span className="w-[8.5rem]" aria-hidden />
          </div>
        ) : null}
        {on.length ? (
          <>
            {band("Работают", on.length)}
            <ul className="divide-y divide-line">{on.map(row)}</ul>
          </>
        ) : null}
        {off.length ? (
          <>
            {band("Выключены", off.length)}
            <ul className="divide-y divide-line">{off.map(row)}</ul>
          </>
        ) : null}
        {!rules.length ? (
          <EmptyState icon={Zap} title="Правил пока нет">
            Начните с простого: пропущенный звонок — задача перезвонить; новая заявка — назначить менеджера по кругу. Кнопка «Новое правило» — вверху.
          </EmptyState>
        ) : !on.length ? (
          <p className="border-t border-line px-5 py-3 text-sm text-muted">Все правила выключены: включите нужные галочкой в строке.</p>
        ) : null}
      </section>
    </div>
  );
}
