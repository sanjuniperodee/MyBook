import { container } from "@/server/container";
import { PageHeader } from "@/components/admin/PageHeader";
import { Segmented } from "@/components/admin/Segmented";
import { Panel } from "@/components/ui/Panel";
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
  const showEntry = pipeline.id === pipelines[0].id;
  const anchors = [
    ["pipelines", "Воронки"],
    ["stages", "Этапы"],
    ...(showEntry ? [["entry", "Новая заявка"]] : []),
    ["milestones", "Действия клиента"],
  ];
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <PageHeader back={{ href: `/admin/deals?p=${pipeline.id}`, label: "Сделки" }} title="Этапы воронки">
        Этапы «в работе» можно переименовывать, менять местами и удалять. «Успех» и «Отказ» закрывают сделку — их можно только переименовать. «Авто» — сделка сама переходит на этап, когда клиент делает это на сайте (только вперёд по воронке).
      </PageHeader>
      <div className="lg:grid lg:grid-cols-[10rem_minmax(0,1fr)] lg:items-start lg:gap-6">
        <nav aria-label="Разделы страницы" className="sticky top-[calc(var(--topbar-h)+1rem)] flex flex-col gap-0.5 text-sm max-lg:hidden">
          {anchors.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="rounded-lg px-2.5 py-1.5 text-muted hover:bg-sunken hover:text-ink">
              {label}
            </a>
          ))}
        </nav>
        <div className="flex min-w-0 flex-col gap-5">
          <div id="pipelines" className="flex scroll-mt-[calc(var(--topbar-h)+1rem)] flex-wrap items-center gap-2" data-testid="pipeline-tabs">
            <Segmented label="Воронки" items={pipelines.map((x) => ({ key: x.id, label: x.name, href: `/admin/deals/stages?p=${x.id}`, active: x.id === pipeline.id }))} />
            <NewPipeline />
          </div>
          <Panel id="stages" flush title="Этапы" description={`Сделок в воронке: ${stages.reduce((n, s) => n + (byStage.get(s.id) ?? 0), 0)}. Порядок — как на доске слева направо.`}>
            <div className="border-b border-line px-4 py-3 sm:px-5">
              <PipelineHeader id={pipeline.id} name={pipeline.name} isDefault={pipeline.id === pipelines[0].id} />
            </div>
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
            <div className="rounded-b-[var(--r-panel)] border-t border-line bg-sunken/40">
              <NewStage pipelineId={pipeline.id} />
            </div>
          </Panel>
          <RoutingPanel
            pipelineId={pipeline.id}
            stages={stages.map((s) => ({ id: s.id, name: s.name, color: s.color, kind: s.kind, milestone: s.milestone }))}
            entry={entry}
            showEntry={showEntry}
          />
        </div>
      </div>
    </div>
  );
}
