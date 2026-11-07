"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { ArrowDown, ArrowUp, LoaderCircle, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/class-names";
import { ruCount } from "@/i18n/plural";
import { ask, toastError } from "@/components/ui/overlays";
import { createPipelineAction, deletePipelineAction, deleteStageAction, moveStageAction, renamePipelineAction, saveStageAction, type DealFormState } from "../actions";
import { Plus } from "lucide-react";
import { stageMilestones } from "@/modules/sales/domain/meta";

const kindLabel = { open: "в работе", won: "успех", lost: "отказ" } as const;

function MilestoneSelect({ value, kind }: { value: string | null; kind: "open" | "won" | "lost" }) {
  if (kind === "lost") return <input type="hidden" name="milestone" value="" />;
  return (
    <select name="milestone" defaultValue={value ?? ""} className="input h-9 w-full text-sm sm:w-48" aria-label="Переводить сюда автоматически" title="Когда клиент сделает это на сайте, сделка сама перейдёт на этот этап (только вперёд)">
      <option value="">вручную</option>
      {Object.entries(stageMilestones).map(([k, v]) => (
        <option key={k} value={k}>
          авто: {v.toLowerCase()}
        </option>
      ))}
    </select>
  );
}

/** Кнопка отправки формы строки: пока сохраняется — крутилка и disabled. */
function Save({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={cn("btn btn-sm", dark ? "btn-dark" : "btn-outline")}>
      {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

const swatch = "size-9 shrink-0 cursor-pointer rounded-lg border border-line-strong bg-white p-1 max-lg:size-11";

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
    <form action={action} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5">
      <input type="hidden" name="id" value={stage.id} />
      <input type="color" name="color" defaultValue={stage.color} className={swatch} aria-label="Цвет этапа" />
      <input name="name" defaultValue={stage.name} maxLength={40} required aria-label="Название этапа" className="input h-9 min-w-0 flex-1 basis-40 text-sm max-lg:h-11" />
      <span className="flex shrink-0 items-center gap-2">
        <Badge tone={stage.kind === "won" ? "success" : stage.kind === "lost" ? "danger" : "neutral"}>{kindLabel[stage.kind]}</Badge>
        <span className="text-xs whitespace-nowrap text-muted tabular-nums" title="Сделок на этапе">
          {ruCount(deals, "сделка", "сделки", "сделок")}
        </span>
      </span>
      <MilestoneSelect value={stage.milestone} kind={stage.kind} />
      <div className="ml-auto flex items-center gap-1">
        <Save>Сохранить</Save>
        <button type="button" className="btn btn-ghost btn-icon btn-sm max-lg:size-11" disabled={!canUp || pending} onClick={() => run(() => moveStageAction(stage.id, -1))} aria-label="Выше" title="Выше">
          <ArrowUp className="size-4" aria-hidden />
        </button>
        <button type="button" className="btn btn-ghost btn-icon btn-sm max-lg:size-11" disabled={!canDown || pending} onClick={() => run(() => moveStageAction(stage.id, 1))} aria-label="Ниже" title="Ниже">
          <ArrowDown className="size-4" aria-hidden />
        </button>
        {stage.kind === "open" ? (
          <button type="button" className="btn btn-ghost btn-icon btn-sm text-muted hover:text-danger max-lg:size-11" disabled={pending} onClick={async () => (await ask(`Удалить этап «${stage.name}»?`, true)) && run(() => deleteStageAction(stage.id))} aria-label="Удалить" title="Удалить этап">
            <Trash2 className="size-4" aria-hidden />
          </button>
        ) : (
          <span className="size-9 max-lg:size-11" aria-hidden />
        )}
      </div>
      {state.error ? (
        <p className="w-full text-sm text-danger" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

export function NewStage({ pipelineId }: { pipelineId: string }) {
  const [state, action] = useActionState<DealFormState, FormData>(saveStageAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5" aria-label="Новый этап">
      <input type="hidden" name="pipelineId" value={pipelineId} />
      <input type="color" name="color" defaultValue="#c08a5b" className={swatch} aria-label="Цвет этапа" />
      <input name="name" maxLength={40} required placeholder="Новый этап, например «Ждём фото»" aria-label="Название нового этапа" className="input h-9 min-w-0 flex-1 basis-48 text-sm max-lg:h-11" />
      <MilestoneSelect value={null} kind="open" />
      <Save dark>
        <Plus className="size-4" aria-hidden /> Добавить этап
      </Save>
      {state.error ? (
        <p className="w-full text-sm text-danger" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

export function NewPipeline() {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<DealFormState, FormData>(createPipelineAction, {});
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn btn-ghost btn-sm">
        <Plus className="size-4" aria-hidden /> Новая воронка
      </button>
    );
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input name="name" autoFocus required maxLength={40} placeholder="Например, «Корпоративные»" aria-label="Название воронки" className="input h-9 w-56 text-sm" />
      <Save dark>Создать</Save>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
        Отмена
      </button>
      {state.error ? <span className="w-full text-sm text-danger">{state.error}</span> : null}
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
    <div className="flex w-full flex-wrap items-center gap-2">
      <input value={value} onChange={(e) => setValue(e.target.value)} maxLength={40} className="input h-9 w-56 max-w-full font-semibold" aria-label="Название воронки" />
      <button type="button" className="btn btn-outline btn-sm" disabled={pending || value.trim() === name || value.trim().length < 2} onClick={() => run(() => renamePipelineAction(id, value))}>
        Переименовать
      </button>
      {isDefault ? (
        <span className="text-xs text-muted sm:ml-auto">Основная: сюда приходят заявки с сайта, из чатов и звонков</span>
      ) : (
        <button type="button" className="btn btn-ghost btn-sm text-danger hover:text-danger sm:ml-auto" disabled={pending} onClick={async () => (await ask(`Удалить воронку «${name}»?`, true)) && run(() => deletePipelineAction(id))}>
          <Trash2 className="size-4" aria-hidden /> Удалить воронку
        </button>
      )}
    </div>
  );
}
