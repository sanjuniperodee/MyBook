"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { ArrowUpRight, Bot, ChevronDown, LoaderCircle, MessageCircle, MessagesSquare, Phone, PhoneOutgoing, Trash2 } from "lucide-react";
import { ask, toast, toastError } from "@/components/ui/overlays";
import { deleteTaskAction, snoozeTaskAction, toggleTaskAction, updateTaskAction } from "@/app/admin/actions";
import { CompleteTask } from "@/components/admin/CompleteTask";
import { DuePresets } from "@/components/admin/DuePresets";
import { callAction, openChatAction } from "@/app/admin/crm-actions";
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
  /**
   * С кем связаться по задаче: phone — цифры номера для tel: и wa.me (только если сотруднику видны контакты), target —
   * для звонка через АТС и «Открыть чат» (номер сервер найдёт сам). pbx и chat — есть ли у этой строки звонок через АТС
   * и «Открыть чат»: свои у каждой задачи, их разрешает тот, кто ведёт сделку (taskContact). null — задача ни к кому.
   */
  contact?: { phone: string | null; target: { dealId?: string; orderId?: string; clientId?: string }; pbx: boolean; chat: boolean } | null;
}

const reminders = [
  ["none", "Не напоминать"],
  ["0", "В срок"],
  ["15", "За 15 мин"],
  ["60", "За 1 час"],
  ["180", "За 3 часа"],
  ["1440", "За день"],
] as const;

/** Тип задачи — значком-селектом: статусные пары токенов, тёмная тема без правок. */
const kindTone: Record<TaskRow["kind"], string> = {
  task: "bg-sunken text-ink-soft",
  call: "bg-success-bg text-success",
  message: "bg-info-bg text-info",
  meeting: "bg-warning-bg text-warning",
};

/**
 * Строки задач на странице «Задачи» и в «Моём дне»: всё правится на месте — выполнено, тип, заголовок, срок («+1 ч»,
 * «Завтра» или поле), ответственный; в «Подробнее» — напоминание, результат и удаление. Изменение сохраняется сразу,
 * ошибка — под строкой. compact — для телефона («Мой день»): срок подписью, без поля срока и выбора ответственного.
 * contact — у звонка «Позвонить» (через АТС, если можно, иначе tel:), у «Написать» — WhatsApp (wa.me) и «Открыть чат».
 */
export function TaskRows({ tasks, staff, canAssign, compact = false }: { tasks: TaskRow[]; staff: { id: string; label: string }[]; canAssign: boolean; compact?: boolean }) {
  return (
    <ul className="divide-y divide-line">
      {tasks.map((t) => (
        <Row key={t.id} task={t} staff={staff} canAssign={canAssign} compact={compact} />
      ))}
    </ul>
  );
}

function Row({ task, staff, canAssign, compact }: { task: TaskRow; staff: { id: string; label: string }[]; canAssign: boolean; compact: boolean }) {
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

  const [completing, setCompleting] = useState(false);
  // Срок в поле — свой, пока его крутят; новый срок с сервера («+1 ч», «Завтра», пресет) — заменяет его.
  const [due, setDue] = useState(task.due);
  const [serverDue, setServerDue] = useState(task.due);
  if (task.due !== serverDue) {
    setServerDue(task.due);
    setDue(task.due);
  }
  // Отметить выполненной — через «Что сделали?» (tasks-1); снять отметку — сразу.
  const toggle = () =>
    t.done
      ? start(async () => {
          patchLocal({ done: false });
          const res = await toggleTaskAction(t.id);
          setError(res.error ?? null);
        })
      : setCompleting(true);

  // Новый срок считает сервер (по времени магазина); строка обновится вместе со страницей.
  const snooze = (by: "hour" | "tomorrow") =>
    start(async () => {
      patchLocal({ overdue: false });
      const res = await snoozeTaskAction(t.id, by);
      setError(res.error ?? null);
    });

  const quick = "btn btn-ghost btn-sm h-8 px-2.5 text-xs max-lg:h-11 max-lg:px-3 max-lg:text-sm";
  const icon = "flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-sunken hover:text-ink max-lg:size-11";
  return (
    <li className={cn("py-3 text-sm max-lg:text-[15px]", t.done && "opacity-80")}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        {/* Сам флажок ~20 px — нажимается вся область 44 px вокруг него. */}
        <label className="-m-2.5 flex size-11 shrink-0 cursor-pointer items-center justify-center lg:-m-3">
          <input type="checkbox" className="size-5 accent-wine" checked={t.done} disabled={ro} onChange={toggle} aria-label="Выполнено" />
        </label>
        <div className="min-w-0 flex-1 basis-60">
          <div className="flex items-start gap-2">
            <select
              value={t.kind}
              disabled={ro}
              onChange={(e) => save({ kind: e.target.value as TaskRow["kind"] }, { kind: e.target.value })}
              className={cn("fs-keep mt-px shrink-0 cursor-pointer appearance-none rounded-md! px-1.5 py-0.5 text-xs font-medium disabled:cursor-default max-lg:min-h-0! max-lg:text-[13px]", kindTone[t.kind])}
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
              <button type="button" disabled={ro} onClick={() => setEditing(true)} className={cn("min-w-0 text-left leading-snug font-medium", t.done && "font-normal text-muted line-through", !ro && "hover:text-wine")} title={ro ? undefined : "Изменить"}>
                {t.title}
              </button>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted">
            {t.fromBot ? (
              <span className="badge">
                <Bot className="size-3" aria-hidden /> от бота
              </span>
            ) : null}
            {t.context ? (
              <Link href={t.context.href} className="text-wine hover:underline">
                {t.context.label}
              </Link>
            ) : null}
            {compact && t.dueLabel && !t.done ? <span className={cn("tabular-nums", t.overdue && "font-medium text-danger")}>{t.overdue ? `просрочена · ${t.dueLabel}` : t.dueLabel}</span> : null}
            {t.done && t.doneLabel ? <span>выполнена {t.doneLabel}</span> : null}
            {t.result && !open ? <span className="max-w-full truncate">Итог: {t.result}</span> : null}
            {pending ? <LoaderCircle className="size-3 animate-spin" aria-label="Сохраняем" /> : null}
          </div>
          {compact ? null : (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                type="datetime-local"
                value={due}
                disabled={ro}
                // На iPhone колесо даты шлёт изменение на каждый поворот — сохраняем, когда поле отпустили (tasks-3).
                onChange={(e) => setDue(e.target.value)}
                onBlur={() => due !== t.due && save({ due, overdue: false }, { dueAt: due })}
                className={cn("input h-8 w-[11.5rem] px-2.5 text-xs tabular-nums max-lg:h-11 max-lg:min-w-44 max-lg:flex-1", t.overdue && !t.done && "border-danger/60 text-danger")}
                aria-label="Срок"
                title={t.dueLabel ?? "Без срока"}
              />
              <select
                value={t.assigneeId ?? ""}
                disabled={ro || !canAssign}
                onChange={(e) => e.target.value && save({ assigneeId: e.target.value }, { assigneeId: e.target.value })}
                className="input h-8 w-44 px-2.5 text-xs max-lg:h-11 max-lg:min-w-36 max-lg:flex-1"
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
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 max-lg:ml-8">
          {!ro && !t.done ? (
            <>
              <button type="button" className={quick} disabled={pending} onClick={() => snooze("hour")} title="Отложить на час">
                +1 ч
              </button>
              <button type="button" className={quick} disabled={pending} onClick={() => snooze("tomorrow")} title="На завтра, в то же время">
                Завтра
              </button>
            </>
          ) : null}
          <Link href={`/admin/tasks/${t.id}`} className={icon} aria-label="Открыть карточку задачи" title="Карточка задачи: сделка, клиент, заказ, записи">
            <ArrowUpRight className="size-4" aria-hidden />
          </Link>
          <button type="button" onClick={() => setOpen((v) => !v)} className={cn(icon, open && "bg-sunken text-ink")} aria-label={open ? "Скрыть подробности задачи" : "Подробнее: напоминание, результат, удаление"} aria-expanded={open}>
            <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
          </button>
        </div>
      </div>
      {!t.done && t.contact ? <Reach kind={t.kind} contact={t.contact} /> : null}
      {open ? (
        <div className="mt-3 ml-8 grid gap-3 rounded-[10px] border border-line bg-sunken/50 p-3 sm:grid-cols-[12rem_minmax(0,1fr)] sm:p-4">
          <label className="block">
            <span className="label text-xs">Напомнить</span>
            <select
              value={t.remindBeforeMin === null ? "none" : String(t.remindBeforeMin)}
              disabled={ro || !t.due}
              onChange={(e) => save({ remindBeforeMin: e.target.value === "none" ? null : Number(e.target.value) }, { remindBeforeMin: e.target.value })}
              className="input h-9 text-sm"
              title={t.due ? "В CRM со звуком и в WhatsApp ответственного" : "Сначала поставьте срок"}
            >
              {reminders.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label text-xs">Итог: что сделали, о чём договорились</span>
            <textarea
              defaultValue={t.result}
              disabled={ro}
              rows={2}
              maxLength={1000}
              className="input text-sm"
              onBlur={(e) => e.target.value.trim() !== t.result && save({ result: e.target.value.trim() }, { result: e.target.value })}
            />
          </label>
          {ro || t.done || compact ? null : (
            <div className="sm:col-span-2">
              <span className="label text-xs">Быстрый срок</span>
              <DuePresets
                className="flex flex-wrap gap-1.5"
                onPick={(local) => {
                  setDue(local);
                  save({ due: local, overdue: false }, { dueAt: local });
                }}
              />
            </div>
          )}
          {!ro ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3 sm:col-span-2">
              {t.due ? (
                <button type="button" className="btn btn-outline btn-sm" onClick={() => save({ due: "", dueLabel: null, overdue: false }, { dueAt: "" })}>
                  Убрать срок
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-ghost btn-sm ml-auto text-danger hover:bg-danger-bg hover:text-danger"
                onClick={async () =>
                  (await ask("Удалить задачу?", true)) &&
                  start(async () => {
                    const res = await deleteTaskAction(t.id);
                    setError(res.error ?? null);
                  })
                }
                aria-label={`Удалить задачу «${t.title}»`}
              >
                <Trash2 className="size-4" aria-hidden /> Удалить
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p className="mt-1.5 ml-8 text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {completing ? <CompleteTask taskId={t.id} kind={t.kind} onClose={() => setCompleting(false)} /> : null}
    </li>
  );
}

/**
 * Связаться по задаче: у звонка — «Позвонить» (через АТС, если Zadarma подключена и сделку ведёт этот сотрудник; иначе
 * tel: — звонит телефон, с которого открыта CRM), у «Написать» — WhatsApp (wa.me открывает WhatsApp на этом телефоне — на
 * телефоне магазина сообщение уйдёт с номера магазина и попадёт в «Чаты») и «Открыть чат» в CRM. Отказ сервера — всплывающим
 * сообщением; неожиданная ошибка — тоже, а не экраном ошибки вместо CRM.
 */
function Reach({ kind, contact }: { kind: TaskRow["kind"]; contact: NonNullable<TaskRow["contact"]> }) {
  const [calling, startCall] = useTransition();
  const [opening, startChat] = useTransition();
  const router = useRouter();
  const link = "btn btn-outline btn-sm h-8 px-2.5 text-xs max-lg:h-11 max-lg:px-3.5 max-lg:text-sm";
  const buttons: React.ReactNode[] = [];
  if (kind === "call") {
    if (contact.pbx)
      buttons.push(
        <button
          key="pbx"
          type="button"
          className={link}
          disabled={calling}
          onClick={() =>
            startCall(async () => {
              try {
                const r = await callAction(contact.target);
                toast(r.message ?? "Звоним", r.ok ? "success" : "error");
              } catch (err) {
                toastError(err);
              }
            })
          }
        >
          {calling ? <LoaderCircle className="size-3.5 animate-spin" /> : <PhoneOutgoing className="size-3.5" />} Позвонить
        </button>,
      );
    else if (contact.phone)
      buttons.push(
        <a key="tel" href={`tel:+${contact.phone}`} className={link}>
          <Phone className="size-3.5" /> Позвонить
        </a>,
      );
  }
  if (kind === "message") {
    if (contact.phone)
      buttons.push(
        <a key="wa" href={`https://wa.me/${contact.phone}`} target="_blank" rel="noopener noreferrer" className={link} title="Откроет WhatsApp на этом телефоне">
          <MessageCircle className="size-3.5" /> WhatsApp
        </a>,
      );
    if (contact.chat)
      buttons.push(
        <button
          key="chat"
          type="button"
          className={link}
          disabled={opening}
          onClick={() =>
            startChat(async () => {
              try {
                const r = await openChatAction(contact.target);
                if (r.ok && r.id) router.push(`/admin/chats?c=${r.id}`);
                else toast(r.ok ? "Готово" : r.message, r.ok ? "success" : "error");
              } catch (err) {
                toastError(err);
              }
            })
          }
        >
          {opening ? <LoaderCircle className="size-3.5 animate-spin" /> : <MessagesSquare className="size-3.5" />} Открыть чат
        </button>,
      );
  }
  return buttons.length ? <div className="mt-2 ml-8 flex flex-wrap gap-2" data-testid="task-reach">{buttons}</div> : null;
}
