"use client";

import { useActionState, useEffect, useRef } from "react";
import { LoaderCircle, Plus, X } from "lucide-react";
import { createTaskAction, type AdminState } from "@/app/admin/actions";
import { taskKinds } from "@/components/admin/CrmWidgets";
import { DuePresets } from "@/components/admin/DuePresets";
import { submitKeepingValues } from "@/components/admin/submitKeepingValues";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import { toast } from "@/components/ui/overlays";
import { cn } from "@/lib/class-names";

const reminders = [
  ["none", "Не напоминать"],
  ["0", "В срок"],
  ["15", "За 15 минут"],
  ["60", "За 1 час"],
  ["180", "За 3 часа"],
  ["1440", "За день"],
] as const;

/**
 * «Новая задача»: кнопка и диалог с формой (на телефоне — шторка снизу). Тип — одним нажатием, срок — датой и временем или
 * пресетом («через час», «завтра утром»…), напоминание и исполнитель. Ошибка сервера — в форме; успех — тост, форма
 * закрывается. Поля те же, что у формы задач в карточках (createTaskAction).
 */
export function NewTask({ staff, variant = "primary" }: { staff: { id: string; label: string }[]; variant?: "primary" | "outline" }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const dueDate = useRef<HTMLInputElement>(null);
  const dueTime = useRef<HTMLInputElement>(null);
  const [state, action, pending] = useActionState<AdminState, FormData>(createTaskAction, {});
  useEffect(() => {
    if (!state.ok) return;
    form.current?.reset();
    dialog.current?.close();
    toast(state.ok);
  }, [state]);
  const pickDue = (local: string) => {
    if (dueDate.current) dueDate.current.value = local.slice(0, 10);
    if (dueTime.current) dueTime.current.value = local.slice(11, 16);
  };
  return (
    <>
      <button type="button" className={cn("btn btn-sm", variant === "primary" ? "btn-primary" : "btn-outline")} onClick={() => dialog.current?.showModal()} data-testid="new-task">
        <Plus className="size-4" aria-hidden /> Новая задача
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="new-task-title"
        className="m-auto w-[min(34rem,calc(100vw-2rem))] rounded-[20px] border border-line bg-white p-0 text-ink shadow-lift backdrop:bg-ink/40 max-sm:mb-0 max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none"
        onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
      >
        <form ref={form} onSubmit={submitKeepingValues(action)} className="flex flex-col gap-4 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 id="new-task-title" className="text-lg font-semibold">
              Новая задача
            </h2>
            <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Закрыть" onClick={() => dialog.current?.close()}>
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <Field label="Что сделать">
            <input name="title" required minLength={2} maxLength={300} placeholder="Перезвонить, уточнить адрес, отправить макет" className="input" autoFocus />
          </Field>
          <fieldset>
            <legend className="label">Тип</legend>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(taskKinds).map(([k, v]) => (
                <label key={k} className="chip cursor-pointer has-checked:border-ink has-checked:bg-ink has-checked:text-white has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-wine max-lg:h-10">
                  <input type="radio" name="kind" value={k} defaultChecked={k === "task"} className="sr-only" />
                  {v}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Срок">
                <input ref={dueDate} name="dueAt" type="date" className="input" />
              </Field>
              <Field label="Время" hint="Без времени — до 18:00">
                <input ref={dueTime} name="dueTime" type="time" className="input" />
              </Field>
            </div>
            <DuePresets onPick={pickDue} className="mt-2 flex flex-wrap gap-1.5" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Напомнить" hint="В CRM со звуком и в WhatsApp">
              <select name="remindBeforeMin" className="input" defaultValue="60">
                {reminders.map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            {staff.length ? (
              <Field label="Исполнитель">
                <select name="assigneeId" className="input" defaultValue="">
                  <option value="">Мне</option>
                  {staff.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
          </div>
          {state.error ? <Alert>{state.error}</Alert> : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="btn btn-ghost" onClick={() => dialog.current?.close()}>
              Отмена
            </button>
            <button type="submit" className="btn btn-dark" disabled={pending}>
              {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
              {pending ? "Создаём…" : "Создать задачу"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
