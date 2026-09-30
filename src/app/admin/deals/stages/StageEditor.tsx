"use client";

import { useActionState, useTransition } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { ask, toastError } from "@/components/ui/overlays";
import { deleteStageAction, moveStageAction, saveStageAction, type DealFormState } from "../actions";
import { SubmitButton } from "@/components/ui/SubmitButton";

const kindLabel = { open: "в работе", won: "успех", lost: "отказ" } as const;

export function StageRow({ stage, deals, canUp, canDown }: { stage: { id: string; name: string; color: string; kind: "open" | "won" | "lost" }; deals: number; canUp: boolean; canDown: boolean }) {
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

export function NewStage() {
  const [state, action] = useActionState<DealFormState, FormData>(saveStageAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-line bg-white px-4 py-3">
      <input type="color" name="color" defaultValue="#c08a5b" className="size-8 cursor-pointer rounded-lg border border-line" aria-label="Цвет" />
      <input name="name" maxLength={40} required placeholder="Новый этап, например «Ждём фото»" className="input h-9 min-w-0 flex-1 text-sm" />
      <SubmitButton className="btn-sm">Добавить этап</SubmitButton>
      {state.error ? <p className="w-full text-xs text-red-700">{state.error}</p> : null}
    </form>
  );
}
