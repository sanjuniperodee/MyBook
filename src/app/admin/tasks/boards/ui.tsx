"use client";

import { useEffect, useRef, useState } from "react";
import { AlarmClock, CalendarClock, Flag, MessageCircle, Phone, Users } from "lucide-react";
import { menuItemClass } from "@/components/admin/ActionMenu";
import { BOARD_COLORS, isBoardColor, priorityLabels, type TaskPriority } from "@/shared/domain/boards";
import { initialsOf } from "@/app/admin/deals/ui";
import { cn } from "@/lib/class-names";
import type { Staff } from "./client";

/** Цвет метки или обложки: токен темы; незнакомое — серым. */
export const colorOf = (c: string | null | undefined) => (isBoardColor(c) ? BOARD_COLORS[c] : BOARD_COLORS.slate);

/** Метка карточки: цвет + текст (цвет — не единственный признак). compact — полоска без текста, как в Trello. */
export function LabelChip({ name, color, compact, className }: { name: string; color: string; compact?: boolean; className?: string }) {
  const c = colorOf(color);
  if (compact) return <span className={cn("inline-block h-1.5 w-8 rounded-full", className)} style={{ background: c }} title={name} aria-label={`Метка: ${name}`} />;
  return (
    <span className={cn("inline-flex max-w-40 items-center gap-1 truncate rounded-[6px] px-1.5 py-0.5 text-[11px] leading-tight font-semibold", className)} style={{ background: `color-mix(in oklab, ${c} 14%, transparent)`, color: c }}>
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: c }} aria-hidden />
      <span className="truncate">{name}</span>
    </span>
  );
}

/** Исполнители кружками с инициалами; больше трёх — «+N». */
export function Avatars({ ids, staff, max = 3, size = "sm" }: { ids: string[]; staff: Map<string, string>; max?: number; size?: "sm" | "md" }) {
  if (!ids.length) return null;
  const box = size === "md" ? "size-7 text-[10px]" : "size-6 text-[9.5px]";
  const names = ids.map((id) => staff.get(id) ?? "Сотрудник");
  return (
    <span className="flex -space-x-1.5" title={names.join(", ")}>
      {names.slice(0, max).map((n, i) => (
        <span key={i} className={cn("flex shrink-0 items-center justify-center rounded-full border-2 border-white bg-sunken font-semibold text-ink-soft uppercase", box)}>
          {initialsOf(n)}
        </span>
      ))}
      {names.length > max ? <span className={cn("flex shrink-0 items-center justify-center rounded-full border-2 border-white bg-sunken font-semibold text-muted", box)}>+{names.length - max}</span> : null}
    </span>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

/** «до 6 ноя, 14:00» — срок на карточке; без времени («к 18:00» по умолчанию) — только дата. */
export function dueLabel(iso: string, now = new Date()) {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === now.getFullYear();
  const date = d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) }).replace(/\.$/, "").replace(" г.", "");
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - today.getTime()) / 86_400_000);
  const word = days === 0 ? "сегодня" : days === 1 ? "завтра" : days === -1 ? "вчера" : date;
  const time = d.getHours() === 18 && d.getMinutes() === 0 ? "" : `, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `${word}${time}`;
}

/** Срок карточки: просрочен — красным, сегодня — жёлтым, выполнено — зелёным. Цвет + значок + слово. */
export function DueBadge({ dueAt, doneAt, className }: { dueAt: string | null; doneAt: string | null; className?: string }) {
  if (!dueAt) return null;
  const now = new Date();
  const d = new Date(dueAt);
  const overdue = !doneAt && d < now;
  const soon = !doneAt && !overdue && d.getTime() - now.getTime() < 24 * 3_600_000;
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-[6px] px-1 text-[11.5px] font-medium tabular-nums", doneAt ? "bg-success-bg text-success" : overdue ? "bg-danger-bg text-danger" : soon ? "bg-warning-bg text-warning" : "text-muted", className)}
      title={doneAt ? "Выполнено" : overdue ? "Срок прошёл" : "Срок"}
    >
      {overdue ? <AlarmClock className="size-3" aria-hidden /> : <CalendarClock className="size-3" aria-hidden />}
      {dueLabel(dueAt, now)}
    </span>
  );
}

export const priorityTone: Record<TaskPriority, string> = { urgent: "text-danger", high: "text-warning", normal: "text-info", low: "text-muted" };

export function PriorityMark({ priority, withText }: { priority: TaskPriority | null; withText?: boolean }) {
  if (!priority || (priority === "normal" && !withText)) return null;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[11.5px] font-semibold", priorityTone[priority])} title={`Приоритет: ${priorityLabels[priority]}`}>
      <Flag className="size-3" aria-hidden fill={priority === "urgent" ? "currentColor" : "none"} />
      {withText ? priorityLabels[priority] : priority === "urgent" ? "срочно" : null}
    </span>
  );
}

export const kindIcons = { task: null, call: Phone, message: MessageCircle, meeting: Users } as const;
export const kindLabels = { task: "Задача", call: "Позвонить", message: "Написать", meeting: "Встреча" } as const;

export function staffMap(staff: Staff[]) {
  return new Map(staff.map((s) => [s.id, s.label]));
}

/** Значение для <input type="datetime-local"> по времени браузера. */
export function localInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Из <input type="datetime-local"> — ISO со смещением; пусто — null. */
export function fromLocalInput(v: string) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Поле ввода в фокусе — одиночные клавиши («n», «e», «/») не перехватываем. */
export function typingTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

/** Всплывающее окно у кнопки: закрывается кликом мимо и Esc (фокус — обратно на кнопку). */
export function Popover({ button, label, children, className, align = "left", buttonClass }: { button: React.ReactNode; label: string; children: (close: () => void) => React.ReactNode; className?: string; align?: "left" | "right"; buttonClass?: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
      btn.current?.focus();
    };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key, true);
    };
  }, [open]);
  return (
    <div ref={root} className="relative">
      <button ref={btn} type="button" className={buttonClass ?? "btn btn-outline btn-sm"} aria-haspopup="dialog" aria-expanded={open} aria-label={label} title={label} onClick={() => setOpen((v) => !v)}>
        {button}
      </button>
      {open ? (
        <div role="dialog" aria-label={label} className={cn("absolute z-40 mt-1.5 min-w-60 rounded-[var(--r-sheet)] border border-line bg-white p-2 shadow-soft max-sm:fixed max-sm:inset-x-3 max-sm:top-auto max-sm:bottom-[calc(var(--tabbar-h,0px)+0.75rem)]", align === "right" ? "right-0" : "left-0", className)}>
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

export type MenuItem = { label: string; onSelect: () => void; danger?: boolean; icon?: React.ReactNode } | "separator";

/** Меню «⋯»: пункты-кнопки. */
export function Menu({ label, trigger, items, align = "right", buttonClass }: { label: string; trigger: React.ReactNode; items: MenuItem[]; align?: "left" | "right"; buttonClass?: string }) {
  return (
    <Popover label={label} button={trigger} align={align} buttonClass={buttonClass ?? "btn btn-ghost btn-icon btn-sm size-7"} className="p-1.5">
      {(close) => (
        <div role="menu" className="flex flex-col">
          {items.map((it, i) =>
            it === "separator" ? (
              <div key={i} role="separator" className="my-1 h-px bg-line" />
            ) : (
              <button
                key={i}
                type="button"
                role="menuitem"
                className={cn(menuItemClass, it.danger && "text-danger hover:text-danger [&_svg]:text-danger")}
                onClick={() => {
                  close();
                  it.onSelect();
                }}
              >
                {it.icon}
                {it.label}
              </button>
            ),
          )}
        </div>
      )}
    </Popover>
  );
}
