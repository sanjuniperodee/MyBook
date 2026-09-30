"use client";

import { useActionState, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { ask } from "@/components/ui/overlays";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { cn } from "@/lib/utils";
import { deleteFieldAction, saveFieldAction, type FieldState } from "./actions";

const typeLabels = { text: "Текст", number: "Число", date: "Дата", select: "Список", checkbox: "Да / нет" } as const;

export function FieldEditor({ entity, field }: { entity: "deal" | "client"; field: { id: string; key: string; label: string; type: keyof typeof typeLabels; options: string[] } | null }) {
  const [state, action] = useActionState<FieldState, FormData>(saveFieldAction, {});
  const [type, setType] = useState(field?.type ?? "text");
  const [pending, start] = useTransition();
  return (
    <form action={action} className={cn("space-y-2 rounded-2xl border bg-white p-4", field ? "border-line" : "border-dashed border-line")}>
      <input type="hidden" name="entity" value={entity} />
      {field ? <input type="hidden" name="id" value={field.id} /> : null}
      <div className="flex flex-wrap items-center gap-2">
        <input name="label" defaultValue={field?.label} required maxLength={40} placeholder={field ? "" : "Новое поле, например «Бюджет клиента»"} className="input h-9 min-w-0 flex-1 text-sm font-medium" aria-label="Название поля" />
        <select name="type" value={type} onChange={(e) => setType(e.target.value as keyof typeof typeLabels)} className="input h-9 w-36 text-sm" aria-label="Тип поля">
          {Object.entries(typeLabels).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <SubmitButton className="btn-sm h-9">{field ? "Сохранить" : "Добавить"}</SubmitButton>
        {field ? (
          <button type="button" className="text-muted hover:text-red-700" disabled={pending} onClick={async () => (await ask(`Удалить поле «${field.label}»?`, true)) && start(() => deleteFieldAction(field.id))} aria-label="Удалить поле">
            <Trash2 className="size-4" />
          </button>
        ) : null}
      </div>
      {type === "select" ? (
        <input name="options" defaultValue={field?.options.join(", ")} maxLength={1000} placeholder="Варианты через запятую" className="input h-9 text-sm" aria-label="Варианты" />
      ) : null}
      <div className="flex items-center gap-3 text-xs text-muted">
        {field ? <span className="font-mono">{`{${field.label}}`}</span> : null}
        {state.error ? <span className="text-red-700">{state.error}</span> : state.ok ? <span className="text-emerald-700">{state.ok}</span> : null}
      </div>
    </form>
  );
}
