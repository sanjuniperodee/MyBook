import { container } from "@/server/container";
import { PageHeader } from "@/components/admin/PageHeader";
import { Segmented } from "@/components/admin/Segmented";
import { requireStaff } from "@/server/access";
import { NewPipeline, NewStage, PipelineHeader, StageRow } from "./StageEditor";
import { RoutingPanel } from "./RoutingPanel";
import { getSetting } from "@/modules/workspace";

export const metadata = { title: "Этапы воронки" };

export default async function StagesPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  await requireStaff("settings.manage");
  const { p } = await searchParams;
  const pipelines = await container().sales.queries.listPipelines();
  const pipeline = pipelines.find((x) => x.id === p) ?? pipelines[0];
  const [stages, counts] = await Promise.all([container().sales.queries.listStages(pipeline.id), container().reporting.stageCounts()]);
  const byStage = new Map(counts.map((c) => [c.stageId, c.n]));
  let entry: Record<string, string> = {};
  try {
    entry = JSON.parse((await getSetting("crm.entryStages")) || "{}") as Record<string, string>;
  } catch {
    entry = {};
  }
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageHeader back={{ href: `/admin/deals?p=${pipeline.id}`, label: "Сделки" }} title="Этапы воронки">
        Этапы «в работе» можно переименовывать, менять местами и удалять. «Успех» и «Отказ» закрывают сделку — их можно только переименовать. «Авто» — сделка сама переходит на этап, когда клиент делает это на сайте (только вперёд по воронке).
      </PageHeader>
      <div className="flex flex-wrap items-center gap-2" data-testid="pipeline-tabs">
        <Segmented label="Воронки" items={pipelines.map((x) => ({ key: x.id, label: x.name, href: `/admin/deals/stages?p=${x.id}`, active: x.id === pipeline.id }))} />
        <NewPipeline />
      </div>
      <section className="panel">
        <header className="panel-head">
          <PipelineHeader id={pipeline.id} name={pipeline.name} isDefault={pipeline.id === pipelines[0].id} />
        </header>
        <div className="divide-y divide-line">
          {stages.map((s, i) => (
            <StageRow
              key={s.id}
              stage={{ id: s.id, name: s.name, color: s.color, kind: s.kind, milestone: s.milestone }}
              deals={byStage.get(s.id) ?? 0}
              canUp={s.kind === "open" && i > 0 && stages[i - 1].kind === "open"}
              canDown={s.kind === "open" && stages[i + 1]?.kind === "open"}
            />
          ))}
        </div>
        <div className="border-t border-line bg-sunken/40 rounded-b-[14px]">
          <NewStage pipelineId={pipeline.id} />
        </div>
      </section>
      <RoutingPanel
        pipelineId={pipeline.id}
        stages={stages.map((s) => ({ id: s.id, name: s.name, color: s.color, kind: s.kind, milestone: s.milestone }))}
        entry={entry}
        showEntry={pipeline.id === pipelines[0].id}
      />
    </div>
  );
}
