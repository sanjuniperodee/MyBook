"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Check } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/class-names";
import type { BoardView, CardSummary } from "./client";
import { Avatars, DueBadge, LabelChip, PriorityMark } from "./ui";

type SortKey = "title" | "column" | "due" | "priority" | "assignee";
const PRIORITY_RANK = { urgent: 0, high: 1, normal: 2, low: 3 } as const;

/**
 * Список карточек ведомостью (DESIGN.md §7.2): сортировка по столбцам, выбор для массовых действий, галочка «выполнено».
 * На телефоне — строки-карточки.
 */
export function ListView({ cards, columns, labels, staff, selected, onSelect, onSelectAll, onOpen, onHover, onDone }: { cards: CardSummary[]; columns: BoardView["columns"]; labels: Map<string, { name: string; color: string }>; staff: Map<string, string>; selected: Set<string>; onSelect: (id: string) => void; onSelectAll: (ids: string[]) => void; onOpen: (id: string) => void; onHover: (id: string | null) => void; onDone: (c: CardSummary, done: boolean) => void }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "due", dir: 1 });
  const colIndex = new Map(columns.map((c, i) => [c.id, i]));
  const colName = new Map(columns.map((c) => [c.id, c.name]));
  const value = (c: CardSummary): string | number => {
    switch (sort.key) {
      case "title":
        return c.title.toLowerCase();
      case "column":
        return colIndex.get(c.columnId ?? "") ?? 99;
      case "due":
        return c.dueAt ? new Date(c.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      case "priority":
        return c.priority ? PRIORITY_RANK[c.priority] : 9;
      case "assignee":
        return c.assigneeIds[0] ? (staff.get(c.assigneeIds[0]) ?? "я") : "яя";
    }
  };
  const rows = [...cards].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
  });
  const head = (key: SortKey, label: string, className?: string) => (
    <th className={className} aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
      <button type="button" className="inline-flex items-center gap-1 font-semibold hover:text-ink" onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : 1 }))}>
        {label}
        {sort.key === key ? sort.dir === 1 ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden /> : null}
      </button>
    </th>
  );
  if (!cards.length) return <EmptyState title="Карточек нет">Измените фильтр или добавьте карточку на доске.</EmptyState>;
  const all = rows.length > 0 && rows.every((r) => selected.has(r.id));
  return (
    <section className="panel overflow-hidden" aria-label="Список карточек">
      <table className="table w-full max-lg:hidden">
        <thead>
          <tr>
            <th className="w-8">
              <input type="checkbox" checked={all} onChange={() => onSelectAll(all ? [] : rows.map((r) => r.id))} aria-label="Выбрать все" className="size-4 accent-[var(--color-wine)]" />
            </th>
            <th className="w-8" aria-label="Выполнено" />
            {head("title", "Карточка")}
            {head("column", "Колонка")}
            {head("assignee", "Исполнители")}
            {head("due", "Срок")}
            {head("priority", "Приоритет")}
            <th>Чек-лист</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className={cn("cursor-pointer", selected.has(c.id) && "bg-rose/40")} onClick={() => onOpen(c.id)} onMouseEnter={() => onHover(c.id)} onMouseLeave={() => onHover(null)}>
              <td onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" checked={selected.has(c.id)} onChange={() => onSelect(c.id)} aria-label={`Выбрать «${c.title}»`} className="size-4 accent-[var(--color-wine)]" />
              </td>
              <td onClick={(e) => e.stopPropagation()}>
                <DoneBox card={c} onDone={onDone} />
              </td>
              <td className="max-w-[28rem]">
                <div className={cn("truncate font-medium", c.doneAt && "text-muted line-through")}>{c.title}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted">
                  {c.labelIds.map((l) => (labels.get(l) ? <LabelChip key={l} {...labels.get(l)!} /> : null))}
                  {c.linkLabel ? <span className="truncate">{c.linkLabel}</span> : null}
                </div>
              </td>
              <td className="text-ink-soft">{colName.get(c.columnId ?? "") ?? "—"}</td>
              <td>
                <Avatars ids={c.assigneeIds} staff={staff} />
              </td>
              <td>
                <DueBadge dueAt={c.dueAt} doneAt={c.doneAt} />
              </td>
              <td>
                <PriorityMark priority={c.priority} withText />
              </td>
              <td className="text-xs text-muted tabular-nums">{c.checklist.total ? `${c.checklist.done}/${c.checklist.total}` : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="divide-y divide-line lg:hidden">
        {rows.map((c) => (
          <li key={c.id} className="flex items-start gap-3 px-4 py-3">
            <DoneBox card={c} onDone={onDone} />
            <button type="button" onClick={() => onOpen(c.id)} className="min-w-0 flex-1 text-left">
              <span className={cn("block font-medium", c.doneAt && "text-muted line-through")}>{c.title}</span>
              <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                <span>{colName.get(c.columnId ?? "")}</span>
                <DueBadge dueAt={c.dueAt} doneAt={c.doneAt} />
                <PriorityMark priority={c.priority} />
                {c.labelIds.map((l) => (labels.get(l) ? <LabelChip key={l} {...labels.get(l)!} /> : null))}
              </span>
            </button>
            <Avatars ids={c.assigneeIds} staff={staff} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function DoneBox({ card: c, onDone }: { card: CardSummary; onDone: (c: CardSummary, done: boolean) => void }) {
  return (
    <button
      type="button"
      disabled={!c.editable}
      onClick={() => onDone(c, !c.doneAt)}
      className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border-2 max-lg:mt-0.5 max-lg:size-6", c.doneAt ? "border-success bg-success text-white" : "border-line-strong text-transparent hover:border-success hover:text-success")}
      aria-label={c.doneAt ? `Вернуть «${c.title}» в работу` : `Выполнить «${c.title}»`}
    >
      <Check className="size-3" strokeWidth={3} aria-hidden />
    </button>
  );
}
