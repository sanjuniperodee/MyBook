"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/class-names";
import type { BoardView, CardSummary } from "./client";
import { Avatars, colorOf } from "./ui";

const DAY_W = 44;
const DAYS = 35;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const dayDiff = (a: Date, b: Date) => Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86_400_000);

/**
 * Временная шкала (диаграмма Ганта): полоса от начала до срока, у карточки только со сроком — точка. Полосу можно
 * сдвинуть (меняются обе даты) или потянуть за правый край (срок). Строки сгруппированы по колонкам доски.
 */
export function TimelineView({ cards, columns, staff, labels, onOpen, onChange }: { cards: CardSummary[]; columns: BoardView["columns"]; staff: Map<string, string>; labels: Map<string, { name: string; color: string }>; onOpen: (id: string) => void; onChange: (id: string, patch: { startAt?: string | null; dueAt?: string | null }) => void }) {
  const [from, setFrom] = useState(() => addDays(startOfDay(new Date()), -((new Date().getDay() + 6) % 7) - 7));
  const [drag, setDrag] = useState<{ id: string; mode: "move" | "end"; x0: number; dx: number } | null>(null);
  const moved = useRef(false);
  const dated = cards.filter((c) => c.dueAt || c.startAt);
  const undated = cards.length - dated.length;
  const today = dayDiff(new Date(), from);

  const span = (c: CardSummary) => {
    const due = c.dueAt ? new Date(c.dueAt) : new Date(c.startAt!);
    const start = c.startAt ? new Date(c.startAt) : due;
    return { start: dayDiff(start, from), end: dayDiff(due, from), milestone: !c.startAt };
  };

  const up = () => {
    if (!drag) return;
    const days = Math.round(drag.dx / DAY_W);
    const c = cards.find((x) => x.id === drag.id);
    setDrag(null);
    if (!c || !days) return;
    const shift = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + days * 86_400_000).toISOString() : null);
    if (drag.mode === "move") onChange(c.id, { ...(c.startAt ? { startAt: shift(c.startAt) } : {}), ...(c.dueAt ? { dueAt: shift(c.dueAt) } : {}) });
    else if (c.dueAt) {
      const next = shift(c.dueAt)!;
      if (!c.startAt || new Date(next) >= new Date(c.startAt)) onChange(c.id, { dueAt: next });
    }
  };

  return (
    <section className="panel overflow-hidden" aria-label="Временная шкала" onPointerMove={(e) => drag && (setDrag({ ...drag, dx: e.clientX - drag.x0 }), (moved.current = true))} onPointerUp={up} onPointerLeave={up}>
      <header className="flex items-center gap-2 border-b border-line px-3 py-2">
        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setFrom((d) => addDays(d, -7))} aria-label="На неделю назад">
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setFrom(addDays(startOfDay(new Date()), -((new Date().getDay() + 6) % 7) - 7))}>
          Сегодня
        </button>
        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setFrom((d) => addDays(d, 7))} aria-label="На неделю вперёд">
          <ChevronRight className="size-4" aria-hidden />
        </button>
        <span className="text-[13px] text-muted">
          {from.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })} — {addDays(from, DAYS - 1).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}
        </span>
        {undated ? <span className="ml-auto text-xs text-muted">Без дат: {undated}</span> : null}
      </header>
      <div className="overflow-x-auto">
        <div className="relative" style={{ width: 240 + DAYS * DAY_W }}>
          <div className="sticky top-0 flex border-b border-line bg-sunken/60 text-[11px] text-muted">
            <div className="sticky left-0 z-[2] w-60 shrink-0 bg-sunken px-3 py-1.5 font-semibold">Карточка</div>
            {Array.from({ length: DAYS }, (_, i) => addDays(from, i)).map((d, i) => (
              <div key={i} className={cn("shrink-0 border-l border-line py-1.5 text-center tabular-nums", (d.getDay() === 0 || d.getDay() === 6) && "bg-line/40", i === today && "font-semibold text-wine")} style={{ width: DAY_W }}>
                {d.getDate() === 1 || i === 0 ? d.toLocaleDateString("ru-RU", { month: "short" }).replace(".", "") : ""} {d.getDate()}
              </div>
            ))}
          </div>
          {columns.map((col) => {
            const rows = dated.filter((c) => c.columnId === col.id);
            if (!rows.length) return null;
            return (
              <div key={col.id}>
                <div className="sticky left-0 w-60 bg-white px-3 pt-2 pb-1 text-xs font-semibold text-muted">{col.name}</div>
                {rows.map((c) => {
                  const s = span(c);
                  const dx = drag?.id === c.id ? drag.dx : 0;
                  const left = s.start * DAY_W + (drag?.id === c.id && drag.mode === "move" ? dx : 0);
                  const width = Math.max(1, s.end - s.start + 1) * DAY_W + (drag?.id === c.id && drag.mode === "end" ? dx : 0);
                  const label = c.labelIds.map((l) => labels.get(l)).find(Boolean);
                  const overdue = !c.doneAt && c.dueAt && new Date(c.dueAt) < new Date();
                  return (
                    <div key={c.id} className="flex h-9 items-center border-b border-line/60 hover:bg-sunken/40">
                      <button type="button" onClick={() => onOpen(c.id)} className="sticky left-0 z-[1] flex h-full w-60 shrink-0 items-center gap-2 truncate bg-white px-3 text-left text-[13px] hover:text-wine">
                        <span className={cn("truncate", c.doneAt && "text-muted line-through")}>{c.title}</span>
                        <span className="ml-auto">
                          <Avatars ids={c.assigneeIds.slice(0, 1)} staff={staff} />
                        </span>
                      </button>
                      <div className="relative h-full" style={{ width: DAYS * DAY_W }}>
                        {today >= 0 && today < DAYS ? <div className="absolute inset-y-0 w-px bg-wine/40" style={{ left: today * DAY_W + DAY_W / 2 }} aria-hidden /> : null}
                        {s.end >= -1 && s.start <= DAYS ? (
                          s.milestone ? (
                            <button
                              type="button"
                              className={cn("absolute top-1/2 size-3.5 -translate-y-1/2 rotate-45 rounded-[3px]", c.editable && "cursor-grab", overdue ? "bg-danger" : c.doneAt ? "bg-success" : "bg-info")}
                              style={{ left: s.end * DAY_W + DAY_W / 2 - 7 + (drag?.id === c.id ? dx : 0) }}
                              title={`${c.title} — срок`}
                              aria-label={`Срок «${c.title}»`}
                              onPointerDown={(e) => c.editable && (e.currentTarget.setPointerCapture(e.pointerId), (moved.current = false), setDrag({ id: c.id, mode: "move", x0: e.clientX, dx: 0 }))}
                              onClick={() => !moved.current && onOpen(c.id)}
                            />
                          ) : (
                            <div
                              className={cn("absolute top-1.5 bottom-1.5 flex items-center overflow-hidden rounded-[6px] px-2 text-[11.5px] font-medium text-white", c.editable && "cursor-grab", c.doneAt && "opacity-60")}
                              style={{ left, width, background: overdue ? "var(--color-danger)" : label ? colorOf(label.color) : "var(--color-info)" }}
                              onPointerDown={(e) => c.editable && (e.currentTarget.setPointerCapture(e.pointerId), (moved.current = false), setDrag({ id: c.id, mode: "move", x0: e.clientX, dx: 0 }))}
                              onClick={() => !moved.current && onOpen(c.id)}
                              title={c.title}
                            >
                              <span className="truncate">{c.title}</span>
                              {c.editable && c.dueAt ? (
                                <span
                                  className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-black/10"
                                  aria-hidden
                                  onPointerDown={(e) => {
                                    e.stopPropagation();
                                    e.currentTarget.setPointerCapture(e.pointerId);
                                    moved.current = false;
                                    setDrag({ id: c.id, mode: "end", x0: e.clientX, dx: 0 });
                                  }}
                                />
                              ) : null}
                            </div>
                          )
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
          {!dated.length ? <p className="px-4 py-8 text-center text-sm text-muted">У карточек нет дат. Поставьте начало и срок в карточке — они появятся на шкале.</p> : null}
        </div>
      </div>
    </section>
  );
}
