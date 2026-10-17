"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { Bot, ChevronDown, LoaderCircle, Trash2 } from "lucide-react";
import { ask } from "@/components/ui/overlays";
import { deleteTaskAction, toggleTaskAction, updateTaskAction } from "@/app/admin/actions";
import { taskKinds } from "@/components/admin/CrmWidgets";
import { cn } from "@/lib/class-names";

export interface TaskRow {
  id: string;
  title: string;
  kind: keyof typeof taskKinds;
  /** Срок для поля ввода «ГГГГ-ММ-ДДTЧЧ:ММ» по времени магазина; "" — без срока. */
  due: string;
  dueLabel: string | null;
  overdue: boolean;
  done: boolean;
  doneLabel: string | null;
  assigneeId: string | null;
  /** null — не напоминать. */
  remindBeforeMin: number | null;
  result: string;
  context: { label: string; href: string } | null;
  /** Задачу поставил бот (заголовок «… (бот)»). */
  fromBot: boolean;
  /** Можно ли менять (своя, ничья, поставлена мной или право «все задачи»). */
  editable: boolean;
}

const reminders = [
  ["none", "Не напоминать"],
  ["0", "В срок"],
  ["15", "За 15 мин"],
  ["60", "За 1 час"],
  ["180", "За 3 часа"],
  ["1440", "За день"],
] as const;

const kindTone: Record<TaskRow["kind"], string> = {
  task: "bg-cream text-ink-soft",
  call: "bg-emerald-50 text-emerald-800",
  message: "bg-sky-50 text-sky-800",
  meeting: "bg-amber-50 text-amber-800",
};

/**
 * Строки задач на странице «Задачи»: всё правится на месте — выполнено, тип, заголовок, срок, ответственный; в
 * «Подробнее» — напоминание, результат и удаление. Изменение сохраняется сразу, ошибка — под строкой.
 */
export function TaskRows({ tasks, staff, canAssign }: { tasks: TaskRow[]; staff: { id: string; label: string }[]; canAssign: boolean }) {
  return (
    <ul className="divide-y divide-line">
      {tasks.map((t) => (
        <Row key={t.id} task={t} staff={staff} canAssign={canAssign} />
      ))}
    </ul>
  );
}

function Row({ task, staff, canAssign }: { task: TaskRow; staff: { id: string; label: string }[]; canAssign: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [t, patchLocal] = useOptimistic(task, (cur: TaskRow, p: Partial<TaskRow>) => ({ ...cur, ...p }));
  const ro = !t.editable;

  const save = (local: Partial<TaskRow>, patch: Parameters<typeof updateTaskAction>[1]) =>
    start(async () => {
      patchLocal(local);
      const res = await updateTaskAction(t.id, patch);
      setError(res.error ?? null);
    });

  const toggle = () =>
    start(async () => {
      patchLocal({ done: !t.done });
      await toggleTaskAction(t.id);
    });

  return (
    <li className="py-2.5 text-sm">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <input type="checkbox" className="mt-1 size-4 accent-wine" checked={t.done} disabled={ro} onChange={toggle} aria-label="Выполнено" />
        <div className="min-w-0 flex-1 basis-64">
          <div className="flex items-start gap-1.5">
            <select
              value={t.kind}
              disabled={ro}
              onChange={(e) => save({ kind: e.target.value as TaskRow["kind"] }, { kind: e.target.value })}
              className={cn("mt-px shrink-0 cursor-pointer appearance-none rounded px-1.5 py-0.5 text-[11px] font-medium", kindTone[t.kind])}
              aria-label="Тип задачи"
            >
              {Object.entries(taskKinds).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            {editing ? (
              <input
                autoFocus
                defaultValue={t.title}
                maxLength={300}
                className="input h-8 flex-1 text-sm"
                aria-label="Задача"
                onBlur={(e) => {
                  setEditing(false);
                  const v = e.target.value.trim();
                  if (v && v !== t.title) save({ title: v }, { title: v });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") setEditing(false);
                }}
              />
            ) : (
              <button type="button" disabled={ro} onClick={() => setEditing(true)} className={cn("min-w-0 text-left leading-snug", t.done && "text-muted line-through", !ro && "hover:text-wine")} title={ro ? undefined : "Изменить"}>
                {t.title}
              </button>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            {t.fromBot ? (
              <span className="inline-flex items-center gap-1 rounded bg-cream px-1.5 py-0.5 text-ink-soft">
                <Bot className="size-3" /> от бота
              </span>
            ) : null}
            {t.context ? (
              <Link href={t.context.href} className="text-wine hover:underline">
                {t.context.label}
              </Link>
            ) : null}
            {t.done && t.doneLabel ? <span>выполнена {t.doneLabel}</span> : null}
            {t.result && !open ? <span className="truncate">· {t.result}</span> : null}
            {pending ? <LoaderCircle className="size-3 animate-spin" /> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="datetime-local"
            value={t.due}
            disabled={ro}
            onChange={(e) => save({ due: e.target.value, overdue: false }, { dueAt: e.target.value })}
            className={cn("input h-8 w-[11.5rem] text-xs", t.overdue && !t.done && "border-red-300 text-red-700")}
            aria-label="Срок"
            title={t.dueLabel ?? "Без срока"}
          />
          <select
            value={t.assigneeId ?? ""}
            disabled={ro || !canAssign}
            onChange={(e) => e.target.value && save({ assigneeId: e.target.value }, { assigneeId: e.target.value })}
            className="input h-8 w-40 text-xs"
            aria-label="Ответственный"
            title={canAssign ? "Ответственный" : "Передать задачу может руководитель"}
          >
            {t.assigneeId ? null : <option value="">Ничья</option>}
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => setOpen((v) => !v)} className="rounded-lg p-1 text-muted hover:bg-cream hover:text-ink" aria-label="Подробнее" aria-expanded={open}>
            <ChevronDown className={cn("size-4 transition", open && "rotate-180")} />
          </button>
        </div>
      </div>
      {open ? (
        <div className="mt-2 ml-7 grid gap-2 rounded-xl bg-[#fbf9f5] p-3 sm:grid-cols-[180px_1fr_auto]">
          <label className="block text-xs text-muted">
            Напомнить
            <select
              value={t.remindBeforeMin === null ? "none" : String(t.remindBeforeMin)}
              disabled={ro || !t.due}
              onChange={(e) => save({ remindBeforeMin: e.target.value === "none" ? null : Number(e.target.value) }, { remindBeforeMin: e.target.value })}
              className="input mt-1 h-8 w-full text-xs"
              title={t.due ? "В CRM со звуком и в WhatsApp ответственного" : "Сначала поставьте срок"}
            >
              {reminders.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-muted">
            Результат (что сделали, о чём договорились)
            <textarea
              defaultValue={t.result}
              disabled={ro}
              rows={2}
              maxLength={1000}
              className="mt-1 w-full rounded-lg border border-line bg-white px-2 py-1.5 text-sm text-ink"
              onBlur={(e) => e.target.value.trim() !== t.result && save({ result: e.target.value.trim() }, { result: e.target.value })}
            />
          </label>
          <div className="flex items-end gap-2">
            {t.due && !ro ? (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => save({ due: "", dueLabel: null, overdue: false }, { dueAt: "" })}>
                Без срока
              </button>
            ) : null}
            {!ro ? (
              <button type="button" className="rounded-lg p-2 text-muted hover:bg-red-50 hover:text-red-700" onClick={async () => (await ask("Удалить задачу?", true)) && start(() => deleteTaskAction(t.id))} aria-label="Удалить">
                <Trash2 className="size-4" />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {error ? <p className="mt-1 ml-7 text-xs text-red-700">{error}</p> : null}
    </li>
  );
}
