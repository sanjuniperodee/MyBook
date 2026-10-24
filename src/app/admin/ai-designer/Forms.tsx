"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { grantCreditsAction, saveFreeLimitAction, type AiDesignerState } from "./actions";

/** Бесплатный лимит на клиента. */
export function FreeLimitForm({ limit, max, canEdit }: { limit: number; max: number; canEdit: boolean }) {
  const [state, action] = useActionState<AiDesignerState, FormData>(saveFreeLimitAction, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-3" data-testid="ai-free-limit">
      <div>
        <label className="label" htmlFor="limit">
          Бесплатных запросов на клиента
        </label>
        <input id="limit" name="limit" type="number" inputMode="numeric" min={0} max={max} step={1} defaultValue={limit} disabled={!canEdit} className="input h-11 w-32" />
      </div>
      {canEdit ? <SubmitButton className="h-11">Сохранить</SubmitButton> : null}
      <p className="min-w-0 flex-1 text-xs text-muted">
        За всё время, страницы и обложка вместе. Меняется сразу и для тех, кто уже пользовался: подняли — у всех появились ещё запросы, опустили — у тех, кто уже потратил больше, бесплатные кончатся (купленные остаются).
        0 — бесплатных нет, только пакеты.
      </p>
      {state.error ? (
        <p className="w-full text-sm text-red-700" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="w-full text-sm text-emerald-700" role="status">
          {state.ok}
        </p>
      ) : null}
    </form>
  );
}

/** Подарить клиенту запросы — в строке таблицы. */
export function GrantForm({ userId }: { userId: string }) {
  const [state, action] = useActionState<AiDesignerState, FormData>(grantCreditsAction, {});
  return (
    <form action={action} className="flex items-center gap-1.5">
      <input type="hidden" name="userId" value={userId} />
      <input name="count" type="number" inputMode="numeric" min={1} max={200} defaultValue={5} className="input h-8 w-16 text-sm" aria-label="Сколько запросов подарить" />
      <SubmitButton className="btn-sm h-8">Подарить</SubmitButton>
      {state.ok ? <span className="text-xs text-emerald-700">{state.ok}</span> : null}
      {state.error ? <span className="text-xs text-red-700">{state.error}</span> : null}
    </form>
  );
}
