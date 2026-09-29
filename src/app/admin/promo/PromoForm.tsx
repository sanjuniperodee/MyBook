"use client";

import { useActionState, useTransition } from "react";
import { createPromoAction, togglePromoAction, type AdminState } from "../actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";

export function PromoForm() {
  const [state, action] = useActionState<AdminState, FormData>(createPromoAction, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
      <div className="lg:col-span-2">
        <label className="label">Код</label>
        <input name="code" className="input h-11 uppercase" placeholder="LOVE2026" required maxLength={40} />
      </div>
      <div>
        <label className="label">Тип</label>
        <select name="kind" className="input h-11">
          <option value="percent">Процент</option>
          <option value="fixed">Сумма, ₸</option>
        </select>
      </div>
      <div>
        <label className="label">Размер</label>
        <input name="value" type="number" min={1} className="input h-11" required />
      </div>
      <div>
        <label className="label">Лимит</label>
        <input name="maxUses" type="number" min={1} className="input h-11" placeholder="без лимита" />
      </div>
      <div>
        <label className="label">Действует до</label>
        <input name="expiresAt" type="date" className="input h-11" />
      </div>
      <div className="sm:col-span-2 lg:col-span-4">
        <label className="label">Заметка</label>
        <input name="note" className="input h-11" maxLength={200} placeholder="Например: блогер Айгерим, Instagram" />
      </div>
      <div className="lg:col-span-2">
        <SubmitButton className="h-11 w-full">Создать промокод</SubmitButton>
      </div>
      {state.error ? <Alert className="sm:col-span-2 lg:col-span-6">{state.error}</Alert> : null}
      {state.ok ? <Alert kind="success" className="sm:col-span-2 lg:col-span-6">{state.ok}</Alert> : null}
    </form>
  );
}

export function PromoToggle({ id, active }: { id: string; active: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => start(() => togglePromoAction(id))}
      className={active ? "rounded-full bg-emerald-100 px-2.5 py-1 text-xs text-emerald-800" : "rounded-full bg-stone-200 px-2.5 py-1 text-xs text-stone-600"}
      title="Нажмите, чтобы включить или выключить"
    >
      {active ? "Активен" : "Выключен"}
    </button>
  );
}
