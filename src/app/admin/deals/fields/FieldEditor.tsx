"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { Check, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { ask } from "@/components/ui/overlays";
import { cn } from "@/lib/class-names";
import { deleteFieldAction, saveFieldAction, type FieldState } from "./actions";

const typeLabels = { text: "Текст", number: "Число", date: "Дата", select: "Список", checkbox: "Да / нет" } as const;

function Save({ isNew }: { isNew: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={cn("btn btn-sm", isNew ? "btn-dark" : "btn-outline")}>
      {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : isNew ? <Plus className="size-4" aria-hidden /> : null}
      {isNew ? "Добавить поле" : "Сохранить"}
    </button>
  );
}

/** Строка своего поля: название, тип, варианты списка; пустая строка внизу — новое поле. */
export function FieldEditor({ entity, field }: { entity: "deal" | "client"; field: { id: string; key: string; label: string; type: keyof typeof typeLabels; options: string[] } | null }) {
  const [state, action] = useActionState<FieldState, FormData>(saveFieldAction, {});
  const [type, setType] = useState(field?.type ?? "text");
  const [pending, start] = useTransition();
  return (
    <form action={action} className="space-y-2 px-4 py-3 sm:px-5" aria-label={field ? `Поле «${field.label}»` : "Новое поле"}>
      <input type="hidden" name="entity" value={entity} />
      {field ? <input type="hidden" name="id" value={field.id} /> : null}
      <div className="flex flex-wrap items-center gap-2">
        <input name="label" defaultValue={field?.label} required maxLength={40} placeholder={field ? "" : "Новое поле, например «Бюджет клиента»"} className={cn("input h-9 min-w-0 flex-1 basis-48 text-sm max-lg:h-11", field && "font-medium")} aria-label="Название поля" />
        <select name="type" value={type} onChange={(e) => setType(e.target.value as keyof typeof typeLabels)} className="input h-9 w-36 text-sm max-lg:h-11" aria-label="Тип поля">
          {Object.entries(typeLabels).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <Save isNew={!field} />
        {field ? (
          <button type="button" className="btn btn-ghost btn-icon btn-sm text-muted hover:text-danger max-lg:size-11" disabled={pending} onClick={async () => (await ask(`Удалить поле «${field.label}»?`, true)) && start(() => deleteFieldAction(field.id))} aria-label="Удалить поле" title="Удалить поле">
            <Trash2 className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>
      {type === "select" ? <input name="options" defaultValue={field?.options.join(", ")} maxLength={1000} placeholder="Варианты через запятую" className="input h-9 text-sm max-lg:h-11" aria-label="Варианты" /> : null}
      {field || state.error || state.ok ? (
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
          {field ? (
            <span title="Вставьте в шаблон сообщения — подставится значение">
              В шаблонах: <code className="rounded bg-sunken px-1.5 py-0.5 font-mono text-ink-soft">{`{${field.label}}`}</code>
            </span>
          ) : null}
          {state.error ? (
            <span className="text-danger" role="alert">
              {state.error}
            </span>
          ) : state.ok ? (
            <span className="flex items-center gap-1 text-success" role="status">
              <Check className="size-3.5" aria-hidden /> {state.ok}
            </span>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
