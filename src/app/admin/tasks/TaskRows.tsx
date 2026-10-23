"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { ArrowUpRight, Bot, ChevronDown, LoaderCircle, MessageCircle, MessagesSquare, Phone, PhoneOutgoing, Trash2 } from "lucide-react";
import { ask, toast, toastError } from "@/components/ui/overlays";
import { deleteTaskAction, snoozeTaskAction, toggleTaskAction, updateTaskAction } from "@/app/admin/actions";
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

const kindTone: Record<TaskRow["kind"], string> = {
  task: "bg-cream text-ink-soft",
  call: "bg-emerald-50 text-emerald-800",
  message: "bg-sky-50 text-sky-800",
  meeting: "bg-amber-50 text-amber-800",
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

  const toggle = () =>
    start(async () => {
      patchLocal({ done: !t.done });
      await toggleTaskAction(t.id);
    });

  // Новый срок считает сервер (по времени магазина); строка обновится вместе со страницей.
  const snooze = (by: "hour" | "tomorrow") =>
    start(async () => {
      patchLocal({ overdue: false });
      const res = await snoozeTaskAction(t.id, by);
      setError(res.error ?? null);
    });

  return (
    <li className="py-3 text-sm max-lg:text-[15px]">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <input type="checkbox" className="mt-0.5 size-5 accent-wine" checked={t.done} disabled={ro} onChange={toggle} aria-label="Выполнено" />
        <div className="min-w-0 flex-1 basis-64">
          <div className="flex items-start gap-1.5">
            <select
              value={t.kind}
              disabled={ro}
              onChange={(e) => save({ kind: e.target.value as TaskRow["kind"] }, { kind: e.target.value })}
              className={cn("mt-px shrink-0 cursor-pointer appearance-none rounded px-1.5 py-0.5 text-[11px] max-lg:min-h-0! font-medium", kindTone[t.kind])}
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
            {compact && t.dueLabel && !t.done ? <span className={cn(t.overdue && "font-medium text-red-700")}>{t.overdue ? `просрочена · ${t.dueLabel}` : t.dueLabel}</span> : null}
            {t.done && t.doneLabel ? <span>выполнена {t.doneLabel}</span> : null}
            {t.result && !open ? <span className="truncate">· {t.result}</span> : null}
            {pending ? <LoaderCircle className="size-3 animate-spin" /> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!ro && !t.done ? (
            <>
              <button type="button" className="btn btn-ghost btn-sm h-8 px-2 text-xs max-lg:h-11 max-lg:px-3" disabled={pending} onClick={() => snooze("hour")} title="Отложить на час">
                +1 ч
              </button>
              <button type="button" className="btn btn-ghost btn-sm h-8 px-2 text-xs max-lg:h-11 max-lg:px-3" disabled={pending} onClick={() => snooze("tomorrow")} title="На завтра, в то же время">
                Завтра
              </button>
            </>
          ) : null}
          {compact ? null : (
            <>
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
            </>
          )}
          <Link href={`/admin/tasks/${t.id}`} className="flex items-center justify-center rounded-lg p-1 text-muted hover:bg-cream hover:text-wine max-lg:size-11" aria-label="Открыть карточку задачи" title="Карточка задачи: сделка, клиент, заказ, записи">
            <ArrowUpRight className="size-4" />
          </Link>
          <button type="button" onClick={() => setOpen((v) => !v)} className="rounded-lg p-1 text-muted hover:bg-cream hover:text-ink" aria-label="Подробнее" aria-expanded={open}>
            <ChevronDown className={cn("size-4 transition", open && "rotate-180")} />
          </button>
        </div>
      </div>
      {!t.done && t.contact ? <Reach kind={t.kind} contact={t.contact} /> : null}
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
  const link = "btn btn-outline btn-sm h-8 px-2.5 text-xs";
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
  return buttons.length ? <div className="mt-2 ml-7 flex flex-wrap gap-2" data-testid="task-reach">{buttons}</div> : null;
}
