"use client";

import { useActionState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { ask } from "@/components/ui/overlays";
import { cn } from "@/lib/class-names";
import { Result, SaveButton } from "../ui";
import type { SettingsState } from "../state";
import { saveTemplateAction, deleteTemplateAction } from "./actions";

export function TemplateEditor({ template }: { template: { id: string; title: string; text: string } | null }) {
  const [state, action] = useActionState<SettingsState, FormData>(saveTemplateAction, {});
  const [pending, start] = useTransition();
  return (
    <form action={action} className={cn("space-y-3 rounded-[var(--r-ctl)] border p-3", template ? "border-line" : "border-dashed border-line-strong bg-sunken/40")}>
      {template ? <input type="hidden" name="id" value={template.id} /> : null}
      <div className="flex gap-2">
        <input name="title" defaultValue={template?.title} placeholder="Название, например «Сроки»" aria-label="Название шаблона" required maxLength={60} className="input flex-1 font-medium" />
        {template ? (
          <button
            type="button"
            className="btn btn-ghost btn-icon text-muted hover:text-danger"
            disabled={pending}
            onClick={async () => (await ask(`Удалить шаблон «${template.title}»?`, true)) && start(() => deleteTemplateAction(template.id))}
            aria-label="Удалить шаблон"
          >
            <Trash2 className="size-4" />
          </button>
        ) : null}
      </div>
      <textarea name="text" defaultValue={template?.text} placeholder="Здравствуйте, {имя}! …" aria-label="Текст шаблона" required maxLength={2000} rows={3} className="input" />
      <div className="flex flex-wrap items-center gap-3">
        <SaveButton>{template ? "Сохранить" : "Добавить шаблон"}</SaveButton>
        <Result state={state} />
      </div>
    </form>
  );
}
