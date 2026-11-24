"use client";

import { useEffect, useMemo, useState } from "react";
import { DndContext, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";
import { toastError } from "@/components/ui/overlays";
import { cn } from "@/lib/class-names";
import { boardsApi, onBoardEvent, type CardSummary } from "./client";
import { colorOf, kindIcons } from "./ui";

type Mode = "month" | "week" | "day";
const HOURS = Array.from({ length: 16 }, (_, i) => i + 7); // 07–22
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const monday = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));

function range(mode: Mode, at: Date) {
  if (mode === "day") return { from: startOfDay(at), to: addDays(startOfDay(at), 1) };
  if (mode === "week") return { from: monday(at), to: addDays(monday(at), 7) };
  const first = new Date(at.getFullYear(), at.getMonth(), 1);
  const from = monday(first);
  return { from, to: addDays(from, 42) };
}

/** Когда карточка в календаре: срок, без срока — начало. */
const whenOf = (c: CardSummary) => new Date((c.dueAt ?? c.startAt)!);

/**
 * Календарь карточек: месяц, неделя, день. Карточку можно перетащить на другой день (время сохраняется) или час —
 * срок меняется сразу. Клик по пустому месту — новая карточка с этим сроком. На телефоне месяц и неделя — повесткой.
 */
export function CalendarView({ boardId, staff, labels, onOpen, onCreate, filter, mine }: { boardId: string | null; staff: Map<string, string>; labels?: Map<string, { name: string; color: string }>; onOpen: (id: string) => void; onCreate?: (dueAt: string) => Promise<void>; filter?: (c: CardSummary) => boolean; mine?: boolean }) {
  const [mode, setMode] = useState<Mode>("month");
  const [at, setAt] = useState(() => new Date());
  const [cards, setCards] = useState<CardSummary[]>([]);
  const { from, to } = range(mode, at);
  const fromMs = from.getTime();
  const toMs = to.getTime();

  const key = `${fromMs}|${toMs}|${boardId ?? ""}|${mine ? 1 : 0}`;
  const [loaded, setLoaded] = useState("");
  const loading = loaded !== key;
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    boardsApi.calendar(new Date(fromMs), new Date(toMs), { boardId, mine }).then(
      (r) => alive && (setCards(r.cards), setLoaded(key)),
      (e) => alive && (toastError(e), setLoaded(key)),
    );
    return () => {
      alive = false;
    };
  }, [fromMs, toMs, boardId, mine, key, tick]);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    return onBoardEvent(() => {
      if (t) clearTimeout(t);
      t = setTimeout(() => setTick((x) => x + 1), 400);
    });
  }, []);

  const shown = useMemo(() => (filter ? cards.filter(filter) : cards).filter((c) => c.dueAt || c.startAt), [cards, filter]);
  const byDay = useMemo(() => {
    const m = new Map<string, CardSummary[]>();
    for (const c of shown) {
      const k = dayKey(whenOf(c));
      m.set(k, [...(m.get(k) ?? []), c]);
    }
    for (const list of m.values()) list.sort((a, b) => whenOf(a).getTime() - whenOf(b).getTime());
    return m;
  }, [shown]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }));
  const onDragEnd = async (e: DragEndEvent) => {
    const id = String(e.active.id);
    const target = e.over?.id ? String(e.over.id) : null;
    const card = cards.find((c) => c.id === id);
    if (!card || !target) return;
    const old = whenOf(card);
    const [day, hour] = target.split("@");
    const [y, m, d] = day.split("-").map(Number);
    const next = hour ? new Date(y, m - 1, d, Number(hour), 0) : new Date(y, m - 1, d, old.getHours(), old.getMinutes());
    if (next.getTime() === old.getTime()) return;
    const shift = next.getTime() - old.getTime();
    const patch = card.dueAt ? { dueAt: next.toISOString(), ...(card.startAt ? { startAt: new Date(new Date(card.startAt).getTime() + shift).toISOString() } : {}) } : { startAt: next.toISOString() };
    const before = cards;
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    try {
      await boardsApi.updateCard(id, patch);
    } catch (err) {
      setCards(before);
      toastError(err);
    }
  };

  const title =
    mode === "month"
      ? at.toLocaleDateString("ru-RU", { month: "long", year: "numeric" })
      : mode === "week"
        ? `${from.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} — ${addDays(to, -1).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })}`
        : at.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
  const step = (n: number) => setAt((d) => (mode === "month" ? new Date(d.getFullYear(), d.getMonth() + n, 1) : addDays(d, n * (mode === "week" ? 7 : 1))));
  const today = dayKey(new Date());
  const days = Array.from({ length: Math.round((toMs - fromMs) / 86_400_000) }, (_, i) => addDays(from, i));

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <section className="panel overflow-hidden" aria-label="Календарь">
        <header className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => step(-1)} aria-label="Назад">
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setAt(new Date())}>
            Сегодня
          </button>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => step(1)} aria-label="Вперёд">
            <ChevronRight className="size-4" aria-hidden />
          </button>
          <h2 className="text-[15px] font-semibold first-letter:uppercase">{title}</h2>
          {loading ? <LoaderCircle className="size-4 animate-spin text-muted" aria-label="Загружаю" /> : null}
          <div role="tablist" aria-label="Период" className="ml-auto flex rounded-[var(--r-ctl)] bg-sunken p-0.5 text-[13px]">
            {(
              [
                ["month", "Месяц"],
                ["week", "Неделя"],
                ["day", "День"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={mode === k} onClick={() => setMode(k)} className={cn("min-h-10 rounded-[calc(var(--r-ctl)-2px)] px-3 font-medium lg:min-h-7", mode === k ? "bg-white text-ink shadow-[0_1px_2px_rgb(0_0_0/0.12)]" : "text-muted hover:text-ink")}>
                {l}
              </button>
            ))}
          </div>
        </header>

        {mode === "month" ? (
          <>
            <div className="grid grid-cols-7 border-b border-line bg-sunken/60 text-center text-xs font-semibold text-muted max-lg:hidden">
              {WEEKDAYS.map((w) => (
                <div key={w} className="py-1.5">
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 max-lg:hidden">
              {days.map((d) => {
                const k = dayKey(d);
                const list = byDay.get(k) ?? [];
                return (
                  <DayCell key={k} id={k} className={cn("min-h-28 border-r border-b border-line p-1 [&:nth-child(7n)]:border-r-0", d.getMonth() !== at.getMonth() && "bg-sunken/40")} onEmpty={onCreate ? () => onCreate(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 18, 0).toISOString()) : undefined}>
                    <div className={cn("mb-1 flex size-6 items-center justify-center rounded-full text-xs tabular-nums", k === today ? "bg-wine font-semibold text-white" : "text-muted")}>{d.getDate()}</div>
                    <div className="flex flex-col gap-0.5">
                      {list.slice(0, 4).map((c) => (
                        <Chip key={c.id} card={c} onOpen={onOpen} labels={labels} staff={staff} />
                      ))}
                      {list.length > 4 ? (
                        <button type="button" className="px-1 text-left text-[11px] text-muted hover:text-ink" onClick={() => (setAt(d), setMode("day"))}>
                          ещё {list.length - 4}
                        </button>
                      ) : null}
                    </div>
                  </DayCell>
                );
              })}
            </div>
          </>
        ) : null}

        {mode === "week" ? (
          <div className="overflow-x-auto max-lg:hidden">
            <div className="grid min-w-[56rem] grid-cols-[3rem_repeat(7,minmax(0,1fr))]">
              <div className="border-b border-line" />
              {days.map((d, i) => (
                <button key={i} type="button" onClick={() => (setAt(d), setMode("day"))} className={cn("border-b border-l border-line py-1.5 text-center text-xs font-semibold", dayKey(d) === today ? "text-wine" : "text-muted")}>
                  {WEEKDAYS[i]} {d.getDate()}
                </button>
              ))}
              {HOURS.map((h) => (
                <HourRow key={h} hour={h} days={days} byDay={byDay} onOpen={onOpen} onCreate={onCreate} labels={labels} staff={staff} />
              ))}
            </div>
          </div>
        ) : null}

        {mode === "day" ? (
          <div className="grid grid-cols-[3rem_minmax(0,1fr)]">
            {HOURS.map((h) => (
              <HourRow key={h} hour={h} days={[startOfDay(at)]} byDay={byDay} onOpen={onOpen} onCreate={onCreate} labels={labels} staff={staff} wide />
            ))}
          </div>
        ) : null}

        {/* Телефон: месяц и неделя — повесткой по дням */}
        {mode !== "day" ? (
          <ol className="divide-y divide-line lg:hidden">
            {days
              .filter((d) => (mode === "month" ? d.getMonth() === at.getMonth() : true))
              .filter((d) => (byDay.get(dayKey(d)) ?? []).length || dayKey(d) === today)
              .map((d) => (
                <li key={dayKey(d)} className="px-3 py-2.5">
                  <h3 className={cn("mb-1.5 text-xs font-semibold first-letter:uppercase", dayKey(d) === today ? "text-wine" : "text-muted")}>{d.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}</h3>
                  <div className="flex flex-col gap-1">
                    {(byDay.get(dayKey(d)) ?? []).map((c) => (
                      <Chip key={c.id} card={c} onOpen={onOpen} labels={labels} staff={staff} large />
                    ))}
                    {!(byDay.get(dayKey(d)) ?? []).length ? <p className="text-xs text-muted">Ничего на сегодня</p> : null}
                  </div>
                </li>
              ))}
          </ol>
        ) : null}
      </section>
      {!shown.length && !loading ? <p className="mt-2 text-xs text-muted">В этом периоде карточек со сроком нет. Срок ставится в карточке или перетаскиванием здесь.</p> : null}
    </DndContext>
  );
}

function HourRow({ hour, days, byDay, onOpen, onCreate, labels, wide, staff }: { staff: Map<string, string>; hour: number; days: Date[]; byDay: Map<string, CardSummary[]>; onOpen: (id: string) => void; onCreate?: (dueAt: string) => Promise<void>; labels?: Map<string, { name: string; color: string }>; wide?: boolean }) {
  return (
    <>
      <div className="border-b border-line pt-1 pr-1.5 text-right text-[11px] text-muted tabular-nums">{pad(hour)}:00</div>
      {days.map((d) => {
        const k = dayKey(d);
        const list = (byDay.get(k) ?? []).filter((c) => {
          const h = whenOf(c).getHours();
          return hour === 7 ? h <= 7 : hour === 22 ? h >= 22 : h === hour;
        });
        return (
          <DayCell key={k} id={`${k}@${hour}`} className={cn("min-h-11 border-b border-l border-line p-0.5", wide && "min-h-12")} onEmpty={onCreate ? () => onCreate(new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, 0).toISOString()) : undefined}>
            <div className={cn("flex gap-0.5", wide ? "flex-row flex-wrap" : "flex-col")}>
              {list.map((c) => (
                <Chip key={c.id} card={c} onOpen={onOpen} labels={labels} staff={staff} withTime large={wide} />
              ))}
            </div>
          </DayCell>
        );
      })}
    </>
  );
}

function DayCell({ id, className, children, onEmpty }: { id: string; className?: string; children: React.ReactNode; onEmpty?: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={cn(className, isOver && "bg-rose/60")} onDoubleClick={(e) => e.target === e.currentTarget && onEmpty?.()} title={onEmpty ? "Двойной клик — новая карточка" : undefined}>
      {children}
    </div>
  );
}

function Chip({ card: c, onOpen, labels, withTime, large, staff }: { card: CardSummary; onOpen: (id: string) => void; labels?: Map<string, { name: string; color: string }>; withTime?: boolean; large?: boolean; staff?: Map<string, string> }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: c.id, disabled: !c.editable });
  const w = whenOf(c);
  const overdue = !c.doneAt && c.dueAt && new Date(c.dueAt) < new Date();
  const label = c.labelIds.map((l) => labels?.get(l)).find(Boolean);
  const Icon = kindIcons[c.kind];
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      onClick={() => onOpen(c.id)}
      style={{ borderLeftColor: label ? colorOf(label.color) : "var(--color-line-strong)", ...(transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : {}) }}
      className={cn(
        "flex w-full min-w-0 items-center gap-1 rounded-[6px] border-l-[3px] bg-sunken px-1.5 py-0.5 text-left text-[11.5px] leading-tight hover:bg-line/70",
        large && "py-1.5 text-[13px]",
        c.doneAt && "text-muted line-through",
        overdue && "bg-danger-bg text-danger",
        isDragging && "relative z-20 shadow-lift",
        c.editable && "cursor-grab touch-manipulation",
      )}
      title={[c.title, ...c.assigneeIds.map((a) => staff?.get(a)).filter(Boolean)].join(" · ")}
    >
      {Icon ? <Icon className="size-3 shrink-0" aria-hidden /> : null}
      {withTime || large ? <span className="shrink-0 tabular-nums">{w.getHours() === 18 && w.getMinutes() === 0 ? "" : `${pad(w.getHours())}:${pad(w.getMinutes())}`}</span> : null}
      <span className="truncate">{c.title}</span>
    </button>
  );
}
