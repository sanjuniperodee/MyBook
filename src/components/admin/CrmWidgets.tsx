"use client";

import { ask, toast, toastError } from "@/components/ui/overlays";
import Link from "next/link";
import { useActionState, useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { CalendarClock, Copy, LoaderCircle, Mail, MessageCircle, MessageSquare, Phone, Plus, Sparkles, StickyNote, Trash2 } from "lucide-react";
import { CompleteTask } from "./CompleteTask";
import { DuePresets } from "./DuePresets";
import { addNoteAction, assignOrderAction, createTaskAction, deleteNoteAction, deleteTaskAction, toggleTaskAction, type AdminState } from "@/app/admin/actions";
import { useFormStatus } from "react-dom";
import { MentionTextarea } from "./MentionTextarea";
import { submitKeepingValues } from "./submitKeepingValues";
import { cn } from "@/lib/class-names";
import { draftFromNote, whatsappLink } from "@/shared/domain/templates";

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
  titleId,
}: {
  tasks: TaskItem[];
  admins: { id: string; label: string }[];
  clientId?: string;
  orderId?: string;
  dealId?: string;
  showForm?: boolean;
  emptyText?: string;
  /** id поля «Новая задача» — на него ведёт «поставьте задачу» в шапке сделки. */
  titleId?: string;
}) {
  const [, start] = useTransition();
  const [state, action, adding] = useActionState<AdminState, FormData>(createTaskAction, {});
  /** Действие по задаче: отказ ({ error }) и неожиданная ошибка — тостом, а не экраном ошибки вместо карточки. */
  const runTask = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      try {
        const r = await fn();
        if (r.error) toast(r.error, "error");
      } catch (err) {
        toastError(err);
      }
    });
  const [optimistic, setOptimistic] = useOptimistic(tasks, (list: TaskItem[], id: string) => list.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  // «Что сделали?» при отметке (tasks-1): какая задача сейчас закрывается.
  const [completing, setCompleting] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const dueDate = useRef<HTMLInputElement>(null);
  const dueTime = useRef<HTMLInputElement>(null);
  /** Пресет срока (tasks-3) — в поля даты и времени формы. */
  const pickDue = (local: string) => {
    if (dueDate.current) dueDate.current.value = local.slice(0, 10);
    if (dueTime.current) dueTime.current.value = local.slice(11, 16);
  };
  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state]);

  return (
    <div className="@container">
      {tasks.length === 0 && emptyText ? (
        <p className="flex items-center gap-2 py-1 text-sm text-muted">
          <CalendarClock className="size-4 shrink-0" aria-hidden /> {emptyText}
        </p>
      ) : null}
      {optimistic.length ? (
        <ul className="-mt-1 divide-y divide-line">
          {optimistic.map((t) => (
            <li key={t.id} className="group flex flex-wrap items-start gap-3 py-2.5 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 shrink-0 accent-wine max-lg:size-5"
                checked={t.done}
                onChange={() =>
                  t.done
                    ? runTask(async () => {
                        setOptimistic(t.id);
                        return toggleTaskAction(t.id);
                      })
                    : setCompleting(t.id)
                }
                aria-label="Выполнено"
              />
              <div className="min-w-0 flex-1">
                <div className={cn("leading-snug", t.done && "text-muted line-through")}>
                  {t.kind && t.kind !== "task" ? <span className="badge mr-1.5 align-[1px] no-underline">{taskKinds[t.kind]}</span> : null}
                  {t.title}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted">
                  {t.dueLabel ? (
                    <span className={cn("inline-flex items-center gap-1 tabular-nums", t.overdue && !t.done && "font-medium text-danger")}>
                      {t.overdue && !t.done ? <span className="size-1.5 rounded-full bg-danger" aria-hidden /> : null}
                      {t.overdue && !t.done ? `просрочена, ${t.dueLabel}` : t.dueLabel}
                    </span>
                  ) : null}
                  {t.assignee ? <span>{t.assignee}</span> : null}
                  {t.context ? (
                    <Link href={t.context.href} className="text-wine hover:underline">
                      {t.context.label}
                    </Link>
                  ) : null}
                </div>
              </div>
              {/* Только по наведению — на телефоне (наведения нет) кнопка не видна; там и на узких экранах — всегда. */}
              <button
                className="-m-1.5 flex items-center justify-center rounded-lg p-1.5 text-muted opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100 hover:text-danger focus-visible:opacity-100 max-lg:-m-3 max-lg:size-11 max-lg:opacity-100 [@media(hover:none)]:opacity-100"
                onClick={async () => (await ask("Удалить задачу?", true)) && runTask(() => deleteTaskAction(t.id))}
                aria-label={`Удалить задачу «${t.title}»`}
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
              {completing === t.id ? <CompleteTask taskId={t.id} kind={t.kind ?? "task"} onClose={() => setCompleting(null)} /> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {showForm ? (
        // Раскладка — по ширине листа (container query), а не экрана: в узкой колонке карточки поля не вылезают за край.
        <form ref={form} onSubmit={submitKeepingValues(action)} className={cn("space-y-2.5", (tasks.length || emptyText) && "mt-3 border-t border-line pt-3.5")} aria-label="Новая задача">
          {clientId ? <input type="hidden" name="clientId" value={clientId} /> : null}
          {orderId ? <input type="hidden" name="orderId" value={orderId} /> : null}
          {dealId ? <input type="hidden" name="dealId" value={dealId} /> : null}
          <div className="flex flex-wrap gap-2 @max-sm:flex-col">
            <div className="flex min-w-0 flex-1 gap-2">
              <select name="kind" className="input w-auto shrink-0 pr-8" defaultValue="task" aria-label="Тип задачи">
                {Object.entries(taskKinds).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <input id={titleId} name="title" required maxLength={300} placeholder="Следующий шаг: перезвонить, уточнить адрес…" aria-label="Новая задача" className="input min-w-0 flex-1" />
            </div>
            <button type="submit" className="btn btn-dark" disabled={adding}>
              {adding ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />} Добавить задачу
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 @lg:grid-cols-4">
            <input ref={dueDate} name="dueAt" type="date" className="input min-w-0" title="Срок" aria-label="Срок" />
            <input ref={dueTime} name="dueTime" type="time" className="input min-w-0" title="Время (без времени — до 18:00)" aria-label="Время" />
            <select name="remindBeforeMin" className="input min-w-0" defaultValue="60" title="Напомнить в CRM со звуком и в WhatsApp" aria-label="Напомнить заранее">
              <option value="none">Не напоминать</option>
              <option value="0">Напомнить в срок</option>
              <option value="15">За 15 мин</option>
              <option value="60">За 1 час</option>
              <option value="180">За 3 часа</option>
              <option value="1440">За день</option>
            </select>
            <select name="assigneeId" className="input min-w-0" defaultValue="" aria-label="Исполнитель">
              <option value="">Мне</option>
              {admins.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          <DuePresets onPick={pickDue} className="flex min-w-0 flex-wrap gap-1.5" />
          {state.error ? (
            <p className="text-sm text-danger" role="alert">
              {state.error}
            </p>
          ) : null}
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

/**
 * Готовый текст клиенту в истории сделки (правило «праздник»): CRM его не отправляет — «Открыть в WhatsApp» открывает
 * чат клиента на телефоне магазина с этим текстом (номер скрыт от сотрудника — WhatsApp спросит, кому), «Скопировать» —
 * чтобы вставить в чат CRM.
 */
export function DraftActions({ note, whatsappTo }: { note: string; whatsappTo?: string | null }) {
  const text = draftFromNote(note);
  if (!text) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-2" data-testid="draft-actions">
      <a href={whatsappLink(text, whatsappTo)} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">
        <MessageCircle className="size-4" /> Открыть в WhatsApp
      </a>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() =>
          navigator.clipboard.writeText(text).then(
            () => toast("Текст скопирован"),
            () => toast("Не удалось скопировать — выделите текст вручную", "error"),
          )
        }
      >
        <Copy className="size-4" /> Скопировать
      </button>
    </div>
  );
}

/** История общения с клиентом. whatsappTo — номер клиента (цифры), если сотрудник его видит: для готовых текстов. */
export function NotesTimeline({ notes, clientId, orderId, dealId, mentionables, whatsappTo }: { notes: NoteItem[]; clientId?: string | null; orderId?: string; dealId?: string; mentionables?: string[]; whatsappTo?: string | null }) {
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
      <form ref={form} action={action} className="rounded-[var(--r-ctl)] border border-line-strong bg-white transition-[border-color,box-shadow] focus-within:border-wine/60 focus-within:ring-[3px] focus-within:ring-wine/12">
        {clientId ? <input type="hidden" name="clientId" value={clientId} /> : null}
        {orderId ? <input type="hidden" name="orderId" value={orderId} /> : null}
        {dealId ? <input type="hidden" name="dealId" value={dealId} /> : null}
        <input type="hidden" name="kind" value={kind} />
        <div className="flex flex-wrap gap-1 border-b border-line p-1.5" role="radiogroup" aria-label="Что записать">
          {manualKinds.map((k) => {
            const K = kinds[k];
            return (
              <button type="button" role="radio" aria-checked={kind === k} key={k} onClick={() => setKind(k)} className={cn("flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors max-lg:min-h-10 max-lg:px-3 max-lg:text-sm", kind === k ? "bg-ink text-white" : "text-ink-soft hover:bg-sunken")}>
                <K.icon className="size-3.5" aria-hidden /> {K.label}
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
          aria-label="Текст записи"
          placeholder={mentionables?.length ? "Что обсудили, о чём договорились… @имя — позвать коллегу" : "Что обсудили, о чём договорились…"}
          className="block w-full resize-y bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-muted"
        />
        <div className="flex items-center justify-between gap-3 px-2 pb-2">
          {state.error ? (
            <span className="pl-1 text-xs text-danger" role="alert">
              {state.error}
            </span>
          ) : (
            <span />
          )}
          <SaveNote />
        </div>
      </form>
      <ol className="relative mt-5 space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[13px] before:w-px before:bg-line">
        {notes.map((n) => {
          const K = kinds[n.kind];
          return (
            <li key={n.id} className="group relative flex gap-3">
              <span className={cn("relative flex size-7 shrink-0 items-center justify-center rounded-full ring-4 ring-white", n.kind === "system" ? "bg-rose text-wine" : "bg-sunken text-ink-soft")}>
                <K.icon className="size-3.5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted">
                  <span className="font-medium text-ink">{K.label}</span>
                  <span>{n.author}</span>
                  <span className="tabular-nums">{n.dateLabel}</span>
                  {n.orderLabel ? <span className="text-wine">{n.orderLabel}</span> : null}
                  {n.kind !== "system" ? (
                    <button
                      className="ml-auto flex size-7 items-center justify-center rounded-md opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100 hover:text-danger focus-visible:opacity-100 max-lg:size-9 max-lg:opacity-100 [@media(hover:none)]:opacity-100"
                      onClick={async () => (await ask("Удалить заметку?", true)) && start(() => deleteNoteAction(n.id))}
                      aria-label="Удалить"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  ) : null}
                </div>
                <p className="mt-1 text-sm whitespace-pre-line">{n.text}</p>
                {n.kind === "system" ? <DraftActions note={n.text} whatsappTo={whatsappTo} /> : null}
              </div>
            </li>
          );
        })}
      </ol>
      {notes.length === 0 ? <p className="mt-3 text-sm text-muted">Записей пока нет: заметки, звонки и письма появятся здесь.</p> : null}
    </div>
  );
}

/** «Сохранить» записи истории: пока форма отправляется — крутилка и disabled. */
function SaveNote() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-dark btn-sm">
      {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null} Сохранить
    </button>
  );
}

export function AssigneeSelect({ orderId, value, admins }: { orderId: string; value: string | null; admins: { id: string; label: string }[] }) {
  const [pending, start] = useTransition();
  return (
    <select
      aria-label="Ответственный"
      className="input"
      value={value ?? ""}
      disabled={pending}
      onChange={(e) =>
        start(async () => {
          try {
            const r = await assignOrderAction(orderId, e.target.value || null);
            if (r.error) toast(r.error, "error");
          } catch (err) {
            toastError(err, "Не удалось сменить ответственного");
          }
        })
      }
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
