"use client";

import { useActionState, useTransition } from "react";
import { LoaderCircle } from "lucide-react";
import { createPromoAction, togglePromoAction, type AdminState } from "../actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { Field } from "@/components/ui/Field";
import { cn } from "@/lib/class-names";

/** Новый промокод: код, скидка (процент или сумма), лимит и срок — необязательны, заметка — для кого код. Одной колонкой, под боковую панель. */
export function PromoForm() {
  const [state, action] = useActionState<AdminState, FormData>(createPromoAction, {});
  return (
    <form action={action} className="grid grid-cols-2 gap-4">
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
      <Field label="Заметка" optional className="col-span-2">
        <input name="note" className="input" maxLength={200} placeholder="Например: блогер Айгерим, Instagram" />
      </Field>
      <SubmitButton className="btn-dark col-span-2 w-full">Создать промокод</SubmitButton>
      {state.error ? <Alert className="col-span-2">{state.error}</Alert> : null}
      {state.ok ? (
        <Alert kind="success" className="col-span-2">
          {state.ok}
        </Alert>
      ) : null}
    </form>
  );
}

/** Включить или выключить код: статус точкой и подписью (цвет — не единственный признак), нажатие переключает. */
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
      className="btn btn-ghost btn-sm -ml-2 gap-0 px-2"
      title="Нажмите, чтобы включить или выключить"
    >
      <span className={cn("badge", active ? "badge-success" : "")}>{active ? "Активен" : "Выключен"}</span>
      {pending ? <LoaderCircle className="ml-2 size-3.5 animate-spin text-muted" aria-hidden /> : null}
    </button>
  );
}
