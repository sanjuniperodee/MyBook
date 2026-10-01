import { container } from "@/server/container";
import Link from "next/link";
import { requireStaff } from "@/server/access";
import { NewPipeline, NewStage, PipelineHeader, StageRow } from "./StageEditor";
import { cn } from "@/lib/utils";

export const metadata = { title: "Этапы воронки" };

export default async function StagesPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  await requireStaff("settings.manage");
  const { p } = await searchParams;
  const pipelines = await container().sales.queries.listPipelines();
  const pipeline = pipelines.find((x) => x.id === p) ?? pipelines[0];
  const [stages, counts] = await Promise.all([container().sales.queries.listStages(pipeline.id), container().reporting.stageCounts()]);
  const byStage = new Map(counts.map((c) => [c.stageId, c.n]));
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href={`/admin/deals?p=${pipeline.id}`} className="text-sm text-muted hover:text-ink">
        ← Сделки
      </Link>
      <div className="flex flex-wrap items-center gap-2" data-testid="pipeline-tabs">
        {pipelines.map((x) => (
          <Link key={x.id} href={`/admin/deals/stages?p=${x.id}`} className={cn("rounded-full px-3 py-1.5 text-sm", x.id === pipeline.id ? "bg-ink text-white" : "bg-white text-ink-soft hover:bg-cream")}>
            {x.name}
          </Link>
        ))}
        <NewPipeline />
      </div>
      <PipelineHeader id={pipeline.id} name={pipeline.name} isDefault={pipeline.id === pipelines[0].id} />
      <div>
        <h1 className="text-2xl font-semibold">Этапы воронки</h1>
        <p className="mt-1 text-sm text-muted">Этапы «в работе» можно переименовывать, менять местами и удалять. «Успех» и «Отказ» закрывают сделку — их можно только переименовать. «Авто» — сделка сама переходит на этап, когда клиент делает это на сайте (только вперёд по воронке).</p>
      </div>
      <div className="divide-y divide-line rounded-2xl border border-line bg-white">
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
      <NewStage pipelineId={pipeline.id} />
    </div>
  );
}
