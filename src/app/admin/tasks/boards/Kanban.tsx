"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  closestCenter,
} from "@dnd-kit/core";
import { arrayMove, horizontalListSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CheckCircle2, GripVertical, MoreHorizontal, Plus, X } from "lucide-react";
import { cn } from "@/lib/class-names";
import type { BoardView, CardSummary } from "./client";
import { CardTile } from "./CardTile";
import { Menu } from "./ui";

export type Lane = { key: string; title: string };
type Column = BoardView["columns"][number];

const ALL = "all";
const PAGE = 60;
const cid = (lane: string, col: string) => `${lane}|${col}`;
const parse = (container: string) => {
  const [lane, col] = container.split("|");
  return { lane, col };
};

export interface KanbanProps {
  columns: Column[];
  cards: CardSummary[];
  lanes: Lane[] | null;
  laneOf: (c: CardSummary) => string;
  labels: Map<string, { name: string; color: string }>;
  staff: Map<string, string>;
  canManage: boolean;
  selected: Set<string>;
  selecting: boolean;
  wideLabels: boolean;
  /** Карточка, на которую указывают мышью: для «e», «пробел», «c». */
  onHover: (id: string | null) => void;
  onOpen: (id: string) => void;
  onSelect: (id: string) => void;
  onToggleLabels: () => void;
  onMoveCard: (id: string, to: { columnId: string; lane: string | null; beforeId: string | null; afterId: string | null }) => void;
  onMoveColumn: (id: string, beforeId: string | null, afterId: string | null) => void;
  onQuickAdd: (columnId: string, title: string, lane: string | null) => Promise<void>;
  onColumnMenu: (col: Column, action: "rename" | "wip" | "done" | "delete" | "top") => void;
  onAddColumn: () => void;
  /** Колонка, где открыть быстрый ввод (клавиша «n»). */
  addingIn: string | null;
  setAddingIn: (columnId: string | null) => void;
}

/** Порядок карточек в колонке: по позиции, без позиции — после, в порядке сервера (срок, создание). */
function ordered(cards: CardSummary[]) {
  return cards
    .map((c, i) => [c, i] as const)
    .sort(([a, ai], [b, bi]) => (a.position ?? Number.POSITIVE_INFINITY) - (b.position ?? Number.POSITIVE_INFINITY) || ai - bi)
    .map(([c]) => c);
}

/**
 * Доска: колонки с лимитами WIP, дорожки (по исполнителю или метке), перетаскивание карточек и колонок. Положение
 * меняется сразу, сервер подтверждает или откатывает (родитель). На телефоне колонки листаются по одной.
 */
export function Kanban(p: KanbanProps) {
  const lanes = p.lanes ?? [{ key: ALL, title: "" }];
  const byId = useMemo(() => new Map(p.cards.map((c) => [c.id, c])), [p.cards]);
  const base = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const l of lanes) for (const col of p.columns) m[cid(l.key, col.id)] = [];
    for (const c of ordered(p.cards)) {
      const key = cid(p.lanes ? p.laneOf(c) : ALL, c.columnId ?? "");
      (m[key] ??= []).push(c.id);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- дорожки зависят от p.lanes/laneOf, пересчёт по карточкам и колонкам
  }, [p.cards, p.columns, p.lanes]);
  const [items, setItems] = useState(base);
  const [active, setActive] = useState<{ id: string; type: "card" | "column"; from: string } | null>(null);
  // Пока тащат — своё состояние; отпустили — снова из данных доски.
  const shown = active?.type === "card" ? items : base;
  const [colOrder, setColOrder] = useState<string[]>(p.columns.map((c) => c.id));
  const columnIds = active?.type === "column" ? colOrder : p.columns.map((c) => c.id);
  const cols = new Map(p.columns.map((c) => [c.id, c]));

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const containerOf = (id: string, m = items) => (id in m ? id : Object.keys(m).find((k) => m[k].includes(id)));

  const collision: CollisionDetection = (args) => {
    if (active?.type === "column") return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => c.data.current?.type === "column") });
    return closestCorners({ ...args, droppableContainers: args.droppableContainers.filter((c) => c.data.current?.type !== "column") });
  };

  const onDragStart = (e: DragStartEvent) => {
    const type = e.active.data.current?.type === "column" ? "column" : "card";
    const id = String(e.active.id);
    if (type === "column") setColOrder(p.columns.map((c) => c.id));
    else setItems(base);
    setActive({ id, type, from: type === "card" ? (containerOf(id, base) ?? "") : "" });
  };

  const onDragOver = (e: DragOverEvent) => {
    if (active?.type !== "card" || !e.over) return;
    const id = String(e.active.id);
    const overId = String(e.over.id);
    setItems((m) => {
      const from = containerOf(id, m);
      const to = containerOf(overId, m);
      if (!from || !to || from === to) return m;
      const target = m[to].filter((x) => x !== id);
      const overIndex = target.indexOf(overId);
      const index = overIndex >= 0 ? overIndex : target.length;
      target.splice(index, 0, id);
      return { ...m, [from]: m[from].filter((x) => x !== id), [to]: target };
    });
  };

  const onDragEnd = (e: DragEndEvent) => {
    const id = String(e.active.id);
    const was = active;
    setActive(null);
    if (!was || !e.over) return;
    const overId = String(e.over.id);
    if (was.type === "column") {
      const oldIndex = colOrder.indexOf(id);
      const newIndex = colOrder.indexOf(overId);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
      const next = arrayMove(colOrder, oldIndex, newIndex);
      const i = next.indexOf(id);
      p.onMoveColumn(id, next[i - 1] ?? null, next[i + 1] ?? null);
      return;
    }
    const to = containerOf(id);
    if (!to) return;
    let list = items[to];
    const overIndex = list.indexOf(overId);
    const fromIndex = list.indexOf(id);
    if (overIndex >= 0 && overIndex !== fromIndex) list = arrayMove(list, fromIndex, overIndex);
    const i = list.indexOf(id);
    if (to === was.from && i === base[to]?.indexOf(id)) return;
    const { lane, col } = parse(to);
    p.onMoveCard(id, { columnId: col, lane: p.lanes ? lane : null, beforeId: list[i - 1] ?? null, afterId: list[i + 1] ?? null });
  };

  // Длинная колонка (сотни задач из сделок) рисуется порциями: первые PAGE, дальше — «Показать ещё».
  const [open, setOpen] = useState<Record<string, number>>({});
  const limit = (key: string, ids: string[]) => ids.slice(0, open[key] ?? PAGE);
  const More = ({ container, total }: { container: string; total: number }) => {
    const n = open[container] ?? PAGE;
    return total > n ? (
      <button type="button" className="rounded-[var(--r-ctl)] border border-dashed border-line-strong px-3 py-2 text-[13px] text-muted hover:text-ink" onClick={() => setOpen((o) => ({ ...o, [container]: n + PAGE * 2 }))}>
        Показать ещё {Math.min(total - n, PAGE * 2)} из {total - n}
      </button>
    ) : null;
  };

  const activeCard = active?.type === "card" ? byId.get(active.id) : null;
  const activeColumn = active?.type === "column" ? cols.get(active.id) : null;
  const counts = new Map(p.columns.map((c) => [c.id, p.cards.filter((x) => x.columnId === c.id).length]));

  return (
    <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
      <div className="-mx-4 overflow-x-auto overscroll-x-contain px-4 pb-4 max-lg:snap-x max-lg:snap-mandatory sm:-mx-6 sm:px-6 2xl:-mx-8 2xl:px-8" data-testid="kanban">
        {p.lanes ? (
          <div className="inline-flex min-w-full flex-col gap-3">
            <div className="sticky top-0 z-[1] flex gap-3 pl-0">
              {columnIds.map((id) => {
                const col = cols.get(id)!;
                return <ColumnHeader key={id} col={col} count={counts.get(id) ?? 0} canManage={false} onMenu={p.onColumnMenu} className="w-72 shrink-0 rounded-[var(--r-ctl)] bg-sunken/70 px-2 py-1.5 max-lg:w-[85vw]" />;
              })}
            </div>
            {lanes.map((lane) => (
              <section key={lane.key} aria-label={`Дорожка: ${lane.title}`}>
                <h3 className="sticky left-0 mb-1.5 inline-block text-[13px] font-semibold text-ink-soft">
                  {lane.title} <span className="count">{p.cards.filter((c) => p.laneOf(c) === lane.key).length}</span>
                </h3>
                <div className="flex gap-3">
                  {columnIds.map((colId) => (
                    <Container key={colId} id={cid(lane.key, colId)} ids={shown[cid(lane.key, colId)] ?? []} className="w-72 shrink-0 max-lg:w-[85vw] max-lg:snap-start">
                      {limit(cid(lane.key, colId), shown[cid(lane.key, colId)] ?? []).map((id) => (byId.get(id) ? <SortableCard key={id} card={byId.get(id)!} {...p} /> : null))}
                      <More container={cid(lane.key, colId)} total={(shown[cid(lane.key, colId)] ?? []).length} />
                      <QuickAdd columnId={colId} lane={lane.key} {...p} />
                    </Container>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <SortableContext items={columnIds} strategy={horizontalListSortingStrategy}>
            <div className="flex items-start gap-3">
              {columnIds.map((colId) => {
                const col = cols.get(colId)!;
                const key = cid(ALL, colId);
                return (
                  <SortableColumn key={colId} col={col} canManage={p.canManage} count={counts.get(colId) ?? 0} onMenu={p.onColumnMenu}>
                    <Container id={key} ids={shown[key] ?? []} className="lg:max-h-[calc(100dvh-var(--topbar-h)-13rem)] lg:overflow-y-auto lg:overscroll-contain">
                      {limit(key, shown[key] ?? []).map((id) => (byId.get(id) ? <SortableCard key={id} card={byId.get(id)!} {...p} /> : null))}
                      <More container={key} total={(shown[key] ?? []).length} />
                      {!(shown[key] ?? []).length && p.addingIn !== colId ? <p className="rounded-[var(--r-ctl)] border border-dashed border-line-strong/70 px-3 py-5 text-center text-xs text-muted">{col.done ? "Сюда — выполненные" : "Перетащите карточку или добавьте новую"}</p> : null}
                    </Container>
                    <QuickAdd columnId={colId} lane={null} {...p} />
                  </SortableColumn>
                );
              })}
              {p.canManage ? (
                <button type="button" onClick={p.onAddColumn} className="flex w-72 shrink-0 items-center gap-2 rounded-[var(--r-panel)] border border-dashed border-line-strong px-3 py-3 text-sm text-muted hover:border-ink-soft hover:text-ink max-lg:w-[85vw] max-lg:snap-start">
                  <Plus className="size-4" aria-hidden /> Добавить колонку
                </button>
              ) : null}
            </div>
          </SortableContext>
        )}
      </div>
      <DragOverlay dropAnimation={{ duration: 160, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
        {activeCard ? (
          <div className="w-72 max-lg:w-[80vw]">
            <CardTile card={activeCard} labels={p.labels} staff={p.staff} wideLabels={p.wideLabels} onOpen={() => {}} dragging />
          </div>
        ) : activeColumn ? (
          <div className="w-72 rounded-[var(--r-panel)] bg-sunken p-2 opacity-90 shadow-lift">
            <ColumnHeader col={activeColumn} count={counts.get(activeColumn.id) ?? 0} canManage={false} onMenu={() => {}} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function Container({ id, ids, className, children }: { id: string; ids: string[]; className?: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { type: "container" } });
  return (
    <SortableContext id={id} items={ids} strategy={verticalListSortingStrategy}>
      <div ref={setNodeRef} className={cn("flex min-h-16 flex-col gap-2 rounded-[var(--r-ctl)] transition-colors", isOver && "bg-rose/40", className)}>
        {children}
      </div>
    </SortableContext>
  );
}

function SortableColumn({ col, canManage, count, onMenu, children }: { col: Column; canManage: boolean; count: number; onMenu: KanbanProps["onColumnMenu"]; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: col.id, data: { type: "column" }, disabled: !canManage });
  const over = col.wipLimit != null && count > col.wipLimit;
  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("flex w-72 shrink-0 flex-col gap-2 rounded-[var(--r-panel)] bg-sunken/70 p-2 max-lg:w-[85vw] max-lg:snap-start", over && "bg-danger-bg/60 ring-1 ring-danger/40", isDragging && "opacity-40")}
      aria-label={`Колонка «${col.name}»`}
      data-column={col.name}
    >
      <ColumnHeader col={col} count={count} canManage={canManage} onMenu={onMenu} handle={canManage ? { ref: setActivatorNodeRef, ...attributes, ...listeners } : undefined} />
      {children}
    </section>
  );
}

function ColumnHeader({ col, count, canManage, onMenu, handle, className }: { col: Column; count: number; canManage: boolean; onMenu: KanbanProps["onColumnMenu"]; handle?: Record<string, unknown> & { ref: (el: HTMLElement | null) => void }; className?: string }) {
  const over = col.wipLimit != null && count > col.wipLimit;
  const { ref, ...h } = handle ?? { ref: undefined };
  return (
    <header className={cn("flex items-center gap-1.5 px-1", className)}>
      {handle ? (
        <button type="button" ref={ref} {...h} className="-ml-1 flex size-6 cursor-grab items-center justify-center rounded text-muted hover:text-ink active:cursor-grabbing max-lg:hidden" aria-label={`Перетащить колонку «${col.name}»`}>
          <GripVertical className="size-3.5" aria-hidden />
        </button>
      ) : null}
      {col.done ? <CheckCircle2 className="size-3.5 shrink-0 text-success" aria-label="Колонка выполненных" /> : null}
      <h2 className="min-w-0 flex-1 truncate text-[13px] font-semibold" title={col.name} onDoubleClick={() => canManage && onMenu(col, "rename")}>
        {col.name}
      </h2>
      <span className={cn("count tabular-nums", over && "count-alert")} title={col.wipLimit != null ? `Лимит в работе: ${col.wipLimit}` : "Карточек"}>
        {col.wipLimit != null ? `${count}/${col.wipLimit}` : count}
      </span>
      {canManage ? (
        <Menu
          label={`Колонка «${col.name}»`}
          trigger={<MoreHorizontal className="size-4" aria-hidden />}
          items={[
            { label: "Добавить карточку наверх", onSelect: () => onMenu(col, "top") },
            { label: "Переименовать", onSelect: () => onMenu(col, "rename") },
            { label: col.wipLimit != null ? `Лимит в работе: ${col.wipLimit}` : "Лимит в работе (WIP)", onSelect: () => onMenu(col, "wip") },
            { label: col.done ? "Обычная колонка" : "Колонка выполненных", onSelect: () => onMenu(col, "done") },
            { label: "Удалить колонку", danger: true, onSelect: () => onMenu(col, "delete") },
          ]}
        />
      ) : null}
    </header>
  );
}

function SortableCard({ card, ...p }: KanbanProps & { card: CardSummary }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id, data: { type: "card" }, disabled: !card.editable || p.selecting });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={cn("touch-manipulation", card.editable && !p.selecting && "cursor-grab active:cursor-grabbing", isDragging && "opacity-30")}
      onMouseEnter={() => p.onHover(card.id)}
      onMouseLeave={() => p.onHover(null)}
      role="listitem"
    >
      <CardTile card={card} labels={p.labels} staff={p.staff} wideLabels={p.wideLabels} selected={p.selected.has(card.id)} selecting={p.selecting} onOpen={() => p.onOpen(card.id)} onSelect={() => p.onSelect(card.id)} onToggleLabels={p.onToggleLabels} />
    </div>
  );
}

function QuickAdd({ columnId, lane, addingIn, setAddingIn, onQuickAdd }: KanbanProps & { columnId: string; lane: string | null }) {
  const open = addingIn === (lane ? `${lane}|${columnId}` : columnId);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);
  const submit = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      await onQuickAdd(columnId, t, lane);
      setText("");
      ref.current?.focus();
    } finally {
      setBusy(false);
    }
  };
  if (!open)
    return (
      <button type="button" onClick={() => setAddingIn(lane ? `${lane}|${columnId}` : columnId)} className="flex items-center gap-1.5 rounded-[var(--r-ctl)] px-2 py-1.5 text-left text-[13px] text-muted hover:bg-white hover:text-ink max-lg:min-h-11">
        <Plus className="size-4" aria-hidden /> Добавить карточку
      </button>
    );
  return (
    <form
      className="flex flex-col gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void submit();
          }
          if (e.key === "Escape") {
            e.stopPropagation();
            setAddingIn(null);
          }
        }}
        rows={2}
        maxLength={200}
        placeholder="Название карточки — Enter, чтобы добавить"
        aria-label="Название новой карточки"
        className="input min-h-16 resize-none bg-white py-2 text-[13.5px]"
      />
      <div className="flex items-center gap-1.5">
        <button className="btn btn-dark btn-sm" disabled={!text.trim() || busy}>
          Добавить
        </button>
        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setAddingIn(null)} aria-label="Отмена">
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </form>
  );
}
