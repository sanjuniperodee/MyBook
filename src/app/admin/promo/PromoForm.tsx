"use client";

import { useActionState, useTransition } from "react";
import { LoaderCircle } from "lucide-react";
import { createPromoAction, togglePromoAction, type AdminState } from "../actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { Field } from "@/components/ui/Field";
import { cn } from "@/lib/class-names";

/** Новый промокод: код, скидка (процент или сумма), лимит и срок — необязательны, заметка — для кого код. */
export function PromoForm() {
  const [state, action] = useActionState<AdminState, FormData>(createPromoAction, {});
  return (
    <form action={action} className="grid grid-cols-2 gap-3 lg:grid-cols-6 lg:items-start">
      <Field label="Код" className="col-span-2" hint="Латиница и цифры, клиент вводит при оформлении">
        <input name="code" className="input uppercase" placeholder="LOVE2026" required maxLength={40} autoCapitalize="characters" />
      </Field>
      <Field label="Тип скидки">
        <select name="kind" className="input">
          <option value="percent">Процент</option>
          <option value="fixed">Сумма, ₸</option>
        </select>
      </Field>
      <Field label="Размер">
        <input name="value" type="number" inputMode="numeric" min={1} className="input" required />
      </Field>
      <Field label="Лимит" hint="Пусто — без лимита">
        <input name="maxUses" type="number" inputMode="numeric" min={1} className="input" />
      </Field>
      <Field label="Действует до" hint="Пусто — бессрочно">
        <input name="expiresAt" type="date" className="input" />
      </Field>
      <Field label="Заметка" optional className="col-span-2 lg:col-span-4">
        <input name="note" className="input" maxLength={200} placeholder="Например: блогер Айгерим, Instagram" />
      </Field>
      <div className="col-span-2 lg:pt-7">
        <SubmitButton className="btn-dark w-full">Создать промокод</SubmitButton>
      </div>
      {state.error ? <Alert className="col-span-2 lg:col-span-6">{state.error}</Alert> : null}
      {state.ok ? (
        <Alert kind="success" className="col-span-2 lg:col-span-6">
          {state.ok}
        </Alert>
      ) : null}
    </form>
  );
}

/** Включить или выключить код: переключатель с подписью (цвет — не единственный признак). */
export function PromoToggle({ id, active, code }: { id: string; active: boolean; code?: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={code ? `Промокод ${code} активен` : "Промокод активен"}
      disabled={pending}
      onClick={() => start(() => togglePromoAction(id))}
      className="group inline-flex min-h-9 items-center gap-2 rounded-lg pr-1 text-sm max-lg:min-h-11"
      title="Нажмите, чтобы включить или выключить"
    >
      <span className={cn("relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors", active ? "bg-success" : "bg-line-strong")}>
        <span className={cn("absolute left-0.5 size-4 rounded-full border border-line bg-white shadow-sm transition-transform", active && "translate-x-4")} />
      </span>
      <span className={active ? "text-success" : "text-muted"}>{active ? "Активен" : "Выключен"}</span>
      {pending ? <LoaderCircle className="size-3.5 animate-spin text-muted" aria-hidden /> : null}
    </button>
  );
}
