"use client";

import { useActionState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { ask } from "@/components/ui/overlays";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { cn } from "@/lib/class-names";
import { Result } from "../ui";
import type { SettingsState } from "../state";
import { saveTemplateAction, deleteTemplateAction } from "./actions";

export function TemplateEditor({ template }: { template: { id: string; title: string; text: string } | null }) {
  const [state, action] = useActionState<SettingsState, FormData>(saveTemplateAction, {});
  const [pending, start] = useTransition();
  return (
    <form action={action} className={cn("space-y-2 rounded-xl border p-3", template ? "border-line" : "border-dashed border-line")}>
      {template ? <input type="hidden" name="id" value={template.id} /> : null}
      <div className="flex gap-2">
        <input name="title" defaultValue={template?.title} placeholder="Название, например «Сроки»" required maxLength={60} className="input h-9 flex-1 text-sm font-medium" />
        {template ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm h-9 text-red-700"
            disabled={pending}
            onClick={async () => (await ask(`Удалить шаблон «${template.title}»?`, true)) && start(() => deleteTemplateAction(template.id))}
            aria-label="Удалить шаблон"
          >
            <Trash2 className="size-4" />
          </button>
        ) : null}
      </div>
      <textarea name="text" defaultValue={template?.text} placeholder="Здравствуйте, {имя}! …" required maxLength={2000} rows={3} className="w-full resize-y rounded-xl border border-line bg-[#fbf9f5] px-3 py-2 text-sm outline-none focus:border-wine/40" />
      <div className="flex items-center gap-3">
        <SubmitButton className="btn-sm">{template ? "Сохранить" : "Добавить шаблон"}</SubmitButton>
        <Result state={state} />
      </div>
    </form>
  );
}
