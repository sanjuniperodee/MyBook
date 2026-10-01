import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { crmAutomations } from "@/lib/db/schema";
import { requireStaff } from "@/server/access";
import { listAdmins, staffOptions } from "@/lib/crm";
import { listPipelines, listStages } from "@/lib/crm/deals";
import { formatDate } from "@/lib/utils";
import { AutomationCard } from "./AutomationEditor";

export const metadata = { title: "Автоматизации" };

export default async function AutomationsPage() {
  await requireStaff("settings.manage");
  const [rules, stages, admins] = await Promise.all([db.select().from(crmAutomations).orderBy(asc(crmAutomations.createdAt)), listStages(), listAdmins()]);
  const pipelines = await listPipelines();
  const pname = new Map(pipelines.map((p) => [p.id, p.name]));
  const ctx = { stages: stages.map((s) => ({ id: s.id, name: pipelines.length > 1 ? `${pname.get(s.pipelineId)} · ${s.name}` : s.name })), staff: staffOptions(admins) };
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
            stats={{ runs: r.runs, last: r.lastRunAt ? formatDate(r.lastRunAt, true) : null }}
            ctx={ctx}
          />
        ))}
        <AutomationCard rule={null} stats={null} ctx={ctx} />
      </div>
    </div>
  );
}
