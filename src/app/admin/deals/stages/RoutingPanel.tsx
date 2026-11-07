"use client";

import { useState, useTransition } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
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
    <div className="flex flex-col gap-5" data-testid="funnel-routing">
      {showEntry ? (
        <Panel id="entry" title="Новая заявка" description="На какой этап попадает сделка, когда заявка пришла из канала" actions={pending ? <LoaderCircle className="size-4 animate-spin text-muted" aria-hidden /> : null} flush>
          <div className="divide-y divide-line">
            {Object.entries(entryGroups).map(([group, label]) => (
              <Row key={group} label={label} busy={busy === group}>
                <select value={entryMap[group] ?? ""} onChange={(e) => setEntry(group, e.target.value)} className="input w-full sm:w-56" aria-label={label} disabled={pending}>
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
        </Panel>
      ) : null}

      <Panel id="milestones" title="Действия клиента на сайте" description="Сделка по действиям клиента идёт только вперёд — назад сама не вернётся" flush>
        <div className="divide-y divide-line">
          {Object.entries(stageMilestones).map(([milestone, label]) => {
            const current = stages.find((s) => s.milestone === milestone)?.id ?? "";
            return (
              <Row key={milestone} label={label} busy={busy === milestone}>
                <select value={current} onChange={(e) => setMilestone(milestone, e.target.value)} className="input w-full sm:w-56" aria-label={label} disabled={pending}>
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
        <p className="hint border-t border-line px-4 py-2.5 sm:px-5">На одном этапе — одно действие: выбрав занятый этап, вы переносите на него действие, а прежнее перестанет двигать сделку.</p>
      </Panel>
    </div>
  );
}

function Row({ label, busy, children }: { label: string; busy: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:px-5">
      <span className="min-w-0 flex-1 text-sm">{label}</span>
      <ArrowRight className="hidden size-4 shrink-0 text-muted sm:block" aria-hidden />
      <div className="flex w-full items-center gap-2 sm:w-auto">
        {children}
        <span className="size-4 shrink-0">{busy ? <LoaderCircle className="size-4 animate-spin text-muted" aria-hidden /> : null}</span>
      </div>
    </div>
  );
}
