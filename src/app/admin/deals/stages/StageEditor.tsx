"use client";

import { useActionState, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { ask, toastError } from "@/components/ui/overlays";
import { createPipelineAction, deletePipelineAction, deleteStageAction, moveStageAction, renamePipelineAction, saveStageAction, type DealFormState } from "../actions";
import { Plus } from "lucide-react";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { stageMilestones } from "@/lib/crm/deal-meta";

const kindLabel = { open: "в работе", won: "успех", lost: "отказ" } as const;

function MilestoneSelect({ value, kind }: { value: string | null; kind: "open" | "won" | "lost" }) {
  if (kind === "lost") return <input type="hidden" name="milestone" value="" />;
  return (
    <select name="milestone" defaultValue={value ?? ""} className="input h-9 w-56 text-xs" aria-label="Переводить сюда автоматически" title="Когда клиент сделает это на сайте, сделка сама перейдёт на этот этап (только вперёд)">
      <option value="">вручную</option>
      {Object.entries(stageMilestones).map(([k, v]) => (
        <option key={k} value={k}>
          авто: {v.toLowerCase()}
        </option>
      ))}
    </select>
  );
}

export function StageRow({ stage, deals, canUp, canDown }: { stage: { id: string; name: string; color: string; kind: "open" | "won" | "lost"; milestone: string | null }; deals: number; canUp: boolean; canDown: boolean }) {
  const [state, action] = useActionState<DealFormState, FormData>(saveStageAction, {});
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      try {
        await fn();
      } catch (e) {
        toastError(e);
      }
    });
  return (
    <form action={action} className="flex flex-wrap items-center gap-3 px-4 py-3">
      <input type="hidden" name="id" value={stage.id} />
      <input type="color" name="color" defaultValue={stage.color} className="size-8 cursor-pointer rounded-lg border border-line" aria-label="Цвет" />
      <input name="name" defaultValue={stage.name} maxLength={40} required className="input h-9 min-w-0 flex-1 text-sm" />
      <span className="w-20 text-xs text-muted">
        {kindLabel[stage.kind]} · {deals}
      </span>
      <MilestoneSelect value={stage.milestone} kind={stage.kind} />
      <SubmitButton className="btn-sm">Сохранить</SubmitButton>
      <div className="flex gap-1">
        <button type="button" className="btn btn-ghost btn-sm size-8 px-0" disabled={!canUp || pending} onClick={() => run(() => moveStageAction(stage.id, -1))} aria-label="Выше">
          <ArrowUp className="size-4" />
        </button>
        <button type="button" className="btn btn-ghost btn-sm size-8 px-0" disabled={!canDown || pending} onClick={() => run(() => moveStageAction(stage.id, 1))} aria-label="Ниже">
          <ArrowDown className="size-4" />
        </button>
        {stage.kind === "open" ? (
          <button type="button" className="btn btn-ghost btn-sm size-8 px-0 text-red-700" disabled={pending} onClick={async () => (await ask(`Удалить этап «${stage.name}»?`, true)) && run(() => deleteStageAction(stage.id))} aria-label="Удалить">
            <Trash2 className="size-4" />
          </button>
        ) : null}
      </div>
      {state.error ? <p className="w-full text-xs text-red-700">{state.error}</p> : null}
    </form>
  );
}

export function NewStage({ pipelineId }: { pipelineId: string }) {
  const [state, action] = useActionState<DealFormState, FormData>(saveStageAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-line bg-white px-4 py-3">
      <input type="hidden" name="pipelineId" value={pipelineId} />
      <input type="color" name="color" defaultValue="#c08a5b" className="size-8 cursor-pointer rounded-lg border border-line" aria-label="Цвет" />
      <input name="name" maxLength={40} required placeholder="Новый этап, например «Ждём фото»" className="input h-9 min-w-0 flex-1 text-sm" />
      <MilestoneSelect value={null} kind="open" />
      <SubmitButton className="btn-sm">Добавить этап</SubmitButton>
      {state.error ? <p className="w-full text-xs text-red-700">{state.error}</p> : null}
    </form>
  );
}

export function NewPipeline() {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<DealFormState, FormData>(createPipelineAction, {});
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1 rounded-full border border-dashed border-line px-3 py-1.5 text-sm text-muted hover:text-wine">
        <Plus className="size-3.5" /> Воронка
      </button>
    );
  return (
    <form action={action} className="flex items-center gap-2">
      <input name="name" autoFocus required maxLength={40} placeholder="Например, «Корпоративные»" className="input h-9 w-56 text-sm" />
      <SubmitButton className="btn-sm h-9">Создать</SubmitButton>
      {state.error ? <span className="text-xs text-red-700">{state.error}</span> : null}
    </form>
  );
}

export function PipelineHeader({ id, name, isDefault }: { id: string; name: string; isDefault: boolean }) {
  const [value, setValue] = useState(name);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      try {
        await fn();
      } catch (e) {
        if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
        toastError(e);
      }
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input value={value} onChange={(e) => setValue(e.target.value)} maxLength={40} className="input h-9 w-64 font-semibold" aria-label="Название воронки" />
      <button type="button" className="btn btn-outline btn-sm h-9" disabled={pending || value.trim() === name || value.trim().length < 2} onClick={() => run(() => renamePipelineAction(id, value))}>
        Переименовать
      </button>
      {isDefault ? (
        <span className="text-xs text-muted">основная: сюда приходят заявки с сайта, из чатов и звонков</span>
      ) : (
        <button type="button" className="btn btn-ghost btn-sm h-9 text-red-700" disabled={pending} onClick={async () => (await ask(`Удалить воронку «${name}»?`, true)) && run(() => deletePipelineAction(id))}>
          <Trash2 className="size-4" /> Удалить воронку
        </button>
      )}
    </div>
  );
}
