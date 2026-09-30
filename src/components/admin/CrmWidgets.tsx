"use client";

import { ask } from "@/components/ui/overlays";
import Link from "next/link";
import { useActionState, useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { Mail, MessageSquare, Phone, Sparkles, StickyNote, Trash2 } from "lucide-react";
import { addNoteAction, assignOrderAction, createTaskAction, deleteNoteAction, deleteTaskAction, toggleTaskAction, type AdminState } from "@/app/admin/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { MentionTextarea } from "./MentionTextarea";
import { cn } from "@/lib/utils";

export const taskKinds = { task: "Задача", call: "Позвонить", message: "Написать", meeting: "Встреча" } as const;

export interface TaskItem {
  id: string;
  kind?: keyof typeof taskKinds;
  title: string;
  dueLabel: string | null;
  overdue: boolean;
  done: boolean;
  assignee: string | null;
  context?: { label: string; href: string } | null;
}

/** Список задач с отметкой выполнения и формой добавления. */
export function TaskList({
  tasks,
  admins,
  clientId,
  orderId,
  dealId,
  showForm = true,
  emptyText = "Задач нет",
}: {
  tasks: TaskItem[];
  admins: { id: string; label: string }[];
  clientId?: string;
  orderId?: string;
  dealId?: string;
  showForm?: boolean;
  emptyText?: string;
}) {
  const [, start] = useTransition();
  const [state, action] = useActionState<AdminState, FormData>(createTaskAction, {});
  const [optimistic, setOptimistic] = useOptimistic(tasks, (list: TaskItem[], id: string) => list.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state]);

  return (
    <div>
      {tasks.length === 0 ? <p className="py-3 text-sm text-muted">{emptyText}</p> : null}
      <ul className="divide-y divide-line">
        {optimistic.map((t) => (
          <li key={t.id} className="group flex items-start gap-3 py-2.5 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-wine"
              checked={t.done}
              onChange={() =>
                start(async () => {
                  setOptimistic(t.id);
                  await toggleTaskAction(t.id);
                })
              }
              aria-label="Выполнено"
            />
            <div className="min-w-0 flex-1">
              <div className={cn(t.done && "text-muted line-through")}>
                {t.kind && t.kind !== "task" ? <span className="mr-1.5 rounded bg-cream px-1.5 py-0.5 text-[11px] text-ink-soft no-underline">{taskKinds[t.kind]}</span> : null}
                {t.title}
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted">
                {t.dueLabel ? <span className={cn(t.overdue && !t.done && "font-medium text-red-700")}>{t.dueLabel}</span> : null}
                {t.assignee ? <span>· {t.assignee}</span> : null}
                {t.context ? (
                  <Link href={t.context.href} className="text-wine hover:underline">
                    · {t.context.label}
                  </Link>
                ) : null}
              </div>
            </div>
            <button className="text-muted opacity-0 transition group-hover:opacity-100 hover:text-red-700" onClick={async () => (await ask("Удалить задачу?", true)) && start(() => deleteTaskAction(t.id))} aria-label="Удалить">
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      {showForm ? (
        <form ref={form} action={action} className="mt-3 grid gap-2 sm:grid-cols-[110px_1fr_150px_150px_auto]">
          {clientId ? <input type="hidden" name="clientId" value={clientId} /> : null}
          {orderId ? <input type="hidden" name="orderId" value={orderId} /> : null}
          {dealId ? <input type="hidden" name="dealId" value={dealId} /> : null}
          <select name="kind" className="input h-10 text-sm" defaultValue="task" aria-label="Тип задачи">
            {Object.entries(taskKinds).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <input name="title" required maxLength={300} placeholder="Новая задача: перезвонить, уточнить адрес…" className="input h-10 text-sm" />
          <input name="dueAt" type="date" className="input h-10 text-sm" title="Срок" />
          <select name="assigneeId" className="input h-10 text-sm" defaultValue="">
            <option value="">Мне</option>
            {admins.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
          <SubmitButton className="btn-sm h-10">Добавить</SubmitButton>
          {state.error ? <p className="text-xs text-red-700 sm:col-span-5">{state.error}</p> : null}
        </form>
      ) : null}
    </div>
  );
}

export interface NoteItem {
  id: string;
  kind: "note" | "call" | "message" | "email" | "system";
  text: string;
  author: string;
  dateLabel: string;
  orderLabel?: string | null;
}

const kinds = {
  note: { label: "Заметка", icon: StickyNote },
  call: { label: "Звонок", icon: Phone },
  message: { label: "Сообщение", icon: MessageSquare },
  email: { label: "Письмо", icon: Mail },
  system: { label: "Система", icon: Sparkles },
} as const;
const manualKinds = ["note", "call", "message", "email"] as const;

/** История общения с клиентом. */
export function NotesTimeline({ notes, clientId, orderId, dealId, mentionables }: { notes: NoteItem[]; clientId?: string | null; orderId?: string; dealId?: string; mentionables?: string[] }) {
  const [text, setText] = useState("");
  const [, start] = useTransition();
  const [state, action] = useActionState<AdminState, FormData>(addNoteAction, {});
  const [kind, setKind] = useState<NoteItem["kind"]>("note");
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) {
      form.current?.reset();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- очистка поля после успешной отправки формы
      setText("");
    }
  }, [state]);

  return (
    <div>
      <form ref={form} action={action} className="rounded-xl border border-line bg-[#fbf9f5] p-3">
        {clientId ? <input type="hidden" name="clientId" value={clientId} /> : null}
        {orderId ? <input type="hidden" name="orderId" value={orderId} /> : null}
        {dealId ? <input type="hidden" name="dealId" value={dealId} /> : null}
        <input type="hidden" name="kind" value={kind} />
        <div className="mb-2 flex gap-1">
          {manualKinds.map((k) => {
            const K = kinds[k];
            return (
              <button type="button" key={k} onClick={() => setKind(k)} className={cn("flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs", kind === k ? "bg-ink text-white" : "text-muted hover:bg-cream")}>
                <K.icon className="size-3.5" /> {K.label}
              </button>
            );
          })}
        </div>
        <MentionTextarea
          name="text"
          value={text}
          onValueChange={setText}
          mentionables={mentionables}
          required
          maxLength={5000}
          rows={2}
          placeholder={mentionables?.length ? "Что обсудили, о чём договорились… @имя — позвать коллегу" : "Что обсудили, о чём договорились…"}
          className="w-full resize-y bg-transparent text-sm outline-none"
        />
        <div className="flex items-center justify-between">
          {state.error ? <span className="text-xs text-red-700">{state.error}</span> : <span />}
          <SubmitButton className="btn-sm">Сохранить</SubmitButton>
        </div>
      </form>
      <ol className="mt-4 space-y-3">
        {notes.map((n) => {
          const K = kinds[n.kind];
          return (
            <li key={n.id} className="group flex gap-3">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-cream text-ink-soft">
                <K.icon className="size-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 text-xs text-muted">
                  <span className="font-medium text-ink">{K.label}</span>
                  <span>{n.author}</span>
                  <span>{n.dateLabel}</span>
                  {n.orderLabel ? <span className="text-wine">{n.orderLabel}</span> : null}
                  {n.kind !== "system" ? (
                    <button className="ml-auto opacity-0 transition group-hover:opacity-100 hover:text-red-700" onClick={async () => (await ask("Удалить заметку?", true)) && start(() => deleteNoteAction(n.id))} aria-label="Удалить">
                      <Trash2 className="size-3.5" />
                    </button>
                  ) : null}
                </div>
                <p className="mt-1 text-sm whitespace-pre-line">{n.text}</p>
              </div>
            </li>
          );
        })}
      </ol>
      {notes.length === 0 ? <p className="mt-3 text-sm text-muted">Заметок пока нет.</p> : null}
    </div>
  );
}

export function AssigneeSelect({ orderId, value, admins }: { orderId: string; value: string | null; admins: { id: string; label: string }[] }) {
  const [pending, start] = useTransition();
  return (
    <select
      aria-label="Ответственный"
      className="input h-10 text-sm"
      value={value ?? ""}
      disabled={pending}
      onChange={(e) => start(() => assignOrderAction(orderId, e.target.value || null))}
    >
      <option value="">Не назначен</option>
      {admins.map((a) => (
        <option key={a.id} value={a.id}>
          {a.label}
        </option>
      ))}
    </select>
  );
}
