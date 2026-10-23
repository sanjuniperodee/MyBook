"use client";

import { useState, useTransition } from "react";
import { ArrowRight, LoaderCircle, Zap } from "lucide-react";
import { toast } from "@/components/ui/overlays";
import { entryGroups, stageMilestones } from "@/modules/sales/domain/meta";
import { saveEntryStageAction, saveStageAction } from "../actions";

interface StageOpt {
  id: string;
  name: string;
  color: string;
  kind: "open" | "won" | "lost";
  milestone: string | null;
}

/**
 * «Что куда падает»: слева — действие, справа — этап. Две части: новая заявка (по источнику) и действия клиента на сайте
 * (сделка сама идёт вперёд по воронке). То же, что «Авто» в строке этапа, но по действиям — видно всё сразу.
 */
export function RoutingPanel({ pipelineId, stages, entry, showEntry }: { pipelineId: string; stages: StageOpt[]; entry: Record<string, string>; showEntry: boolean }) {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [entryMap, setEntryMap] = useState(entry);
  // Этап → какое действие на нём стоит (один этап — одно действие): подпись в списке, чтобы выбор не удивлял.
  const held = new Map(stages.filter((s) => s.milestone).map((s) => [s.id, s.milestone!]));
  const open = stages.filter((s) => s.kind === "open");
  const forward = stages.filter((s) => s.kind !== "lost");

  const setMilestone = (milestone: string, stageId: string) =>
    start(async () => {
      setBusy(milestone);
      try {
        // Этап, на котором событие стоит сейчас, и выбранный: событие переезжает (старый хозяин теряет его).
        const current = stages.find((s) => s.milestone === milestone);
        const chosen = stages.find((s) => s.id === stageId);
        const target = chosen ?? current;
        if (!target) return;
        const fd = new FormData();
        fd.set("id", target.id);
        fd.set("name", target.name);
        fd.set("color", target.color);
        fd.set("pipelineId", pipelineId);
        fd.set("milestone", chosen ? milestone : "");
        const r = await saveStageAction({}, fd);
        if (r.error) return toast(r.error, "error");
        toast(chosen ? `«${stageMilestones[milestone as keyof typeof stageMilestones]}» → ${chosen.name}` : "Сделка по этому действию больше не двигается", "success");
      } finally {
        setBusy(null);
      }
    });

  const setEntry = (group: string, stageId: string) =>
    start(async () => {
      setBusy(group);
      const before = entryMap;
      setEntryMap((m) => ({ ...m, [group]: stageId }));
      try {
        const r = await saveEntryStageAction(group, stageId);
        if (r.error) {
          setEntryMap(before);
          return toast(r.error, "error");
        }
        toast("Сохранено", "success");
      } finally {
        setBusy(null);
      }
    });

  return (
    <section className="space-y-4 rounded-2xl border border-line bg-white p-5" data-testid="funnel-routing">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-rose text-wine">
          <Zap className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">Что куда падает</h2>
          <p className="mt-0.5 text-sm text-muted">Выберите, на какой этап попадает сделка при каждом действии. Сделка по действиям клиента идёт только вперёд — назад сама не вернётся.</p>
        </div>
        {pending ? <LoaderCircle className="mt-1 size-4 animate-spin text-muted" /> : null}
      </div>

      {showEntry ? (
        <div>
          <h3 className="mb-2 text-[11px] font-semibold tracking-wider text-muted uppercase">Новая заявка</h3>
          <div className="divide-y divide-line rounded-xl border border-line">
            {Object.entries(entryGroups).map(([group, label]) => (
              <Row key={group} label={label} busy={busy === group}>
                <select value={entryMap[group] ?? ""} onChange={(e) => setEntry(group, e.target.value)} className="input h-9 w-full text-sm sm:w-56" aria-label={label} disabled={pending}>
                  <option value="">первый этап воронки</option>
                  {open.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Row>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <h3 className="mb-2 text-[11px] font-semibold tracking-wider text-muted uppercase">Действия клиента на сайте</h3>
        <div className="divide-y divide-line rounded-xl border border-line">
          {Object.entries(stageMilestones).map(([milestone, label]) => {
            const current = stages.find((s) => s.milestone === milestone)?.id ?? "";
            return (
              <Row key={milestone} label={label} busy={busy === milestone}>
                <select value={current} onChange={(e) => setMilestone(milestone, e.target.value)} className="input h-9 w-full text-sm sm:w-56" aria-label={label} disabled={pending}>
                  <option value="">не двигать сделку</option>
                  {forward.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {held.has(s.id) && held.get(s.id) !== milestone ? ` (сейчас: ${stageMilestones[held.get(s.id) as keyof typeof stageMilestones].toLowerCase()})` : ""}
                    </option>
                  ))}
                </select>
              </Row>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted">На одном этапе — одно действие: выбрав занятый этап, вы переносите на него действие, а прежнее перестанет двигать сделку.</p>
      </div>
    </section>
  );
}

function Row({ label, busy, children }: { label: string; busy: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2.5">
      <span className="min-w-0 flex-1 text-sm">{label}</span>
      <ArrowRight className="hidden size-4 shrink-0 text-muted sm:block" />
      <div className="flex w-full items-center gap-2 sm:w-auto">
        {children}
        <span className="size-4 shrink-0">{busy ? <LoaderCircle className="size-4 animate-spin text-muted" /> : null}</span>
      </div>
    </div>
  );
}
