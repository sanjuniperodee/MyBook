"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { DndContext, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { BookOpen, CalendarClock, Check, Inbox, MessageCircle, Ban, X } from "lucide-react";
import { formatPrice } from "@/config/site";
import { toastError } from "@/components/ui/overlays";
import { acceptDealAction, moveDealAction, rejectDealAction } from "./actions";
import { ask } from "@/components/ui/overlays";
import { lostReasons } from "@/modules/sales/domain/meta";
import { cn } from "@/lib/utils";

export interface DealCard {
  id: string;
  number: number;
  title: string;
  contactName: string;
  stageId: string;
  amount: number;
  /** Принято денег по сделке, ₸. */
  paid?: number;
  source: string;
  assigneeId: string | null;
  assigneeLabel: string | null;
  daysInStage: number;
  task: { overdue: boolean; label: string } | null;
  unread: number;
  tags: string[];
  unsorted: boolean;
  book: { answered: number; total: number } | null;
  /** Дата события из своего поля «Дата события» (YYYY-MM-DD). */
  eventDate: string | null;
}

interface Stage {
  id: string;
  name: string;
  color: string;
  kind: "open" | "won" | "lost";
}


export function DealsBoard({ stages, initial, canEdit }: { stages: Stage[]; initial: DealCard[]; canEdit: boolean }) {
  const [cards, setCards] = useState(initial);
  const [lost, setLost] = useState<{ id: string; stageId: string } | null>(null);
  const [, start] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }));

  const move = (id: string, stageId: string, reason?: string) => {
    const prev = cards;
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, stageId, daysInStage: 0, unsorted: false } : c)));
    start(async () => {
      try {
        await moveDealAction(id, stageId, reason);
      } catch (err) {
        setCards(prev);
        toastError(err);
      }
    });
  };

  const onDragEnd = (e: DragEndEvent) => {
    const id = String(e.active.id);
    const to = e.over?.id ? String(e.over.id) : null;
    const card = cards.find((c) => c.id === id);
    if (!card || !to || to === "unsorted" || (card.stageId === to && !card.unsorted)) return;
    if (stages.find((s) => s.id === to)?.kind === "lost") setLost({ id, stageId: to });
    else move(id, to);
  };

  return (
    <>
      <DndContext sensors={sensors} onDragEnd={canEdit ? onDragEnd : undefined}>
        <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6" data-testid="deals-board">
          {cards.some((c) => c.unsorted) ? (
            <UnsortedColumn
              cards={cards.filter((c) => c.unsorted)}
              canEdit={canEdit}
              onAccept={(id) => {
                const prev = cards;
                setCards((cs) => cs.map((c) => (c.id === id ? { ...c, unsorted: false } : c)));
                start(async () => {
                  try {
                    await acceptDealAction(id);
                  } catch (err) {
                    setCards(prev);
                    toastError(err);
                  }
                });
              }}
              onReject={async (id, spam) => {
                if (!(await ask(spam ? "Пометить как спам? Сделка удалится, с этого номера больше не будет заявок и уведомлений." : "Отклонить заявку? Сделка удалится, переписка и звонки останутся.", true))) return;
                const prev = cards;
                setCards((cs) => cs.filter((c) => c.id !== id));
                start(async () => {
                  try {
                    await rejectDealAction(id, spam);
                  } catch (err) {
                    setCards(prev);
                    toastError(err);
                  }
                });
              }}
            />
          ) : null}
          {stages.map((s) => (
            <Column key={s.id} stage={s} cards={cards.filter((c) => c.stageId === s.id && !c.unsorted)} draggable={canEdit} />
          ))}
        </div>
      </DndContext>
      {lost ? (
        <LostDialog
          onCancel={() => setLost(null)}
          onSubmit={(reason) => {
            move(lost.id, lost.stageId, reason);
            setLost(null);
          }}
        />
      ) : null}
    </>
  );
}

function UnsortedColumn({ cards, canEdit, onAccept, onReject }: { cards: DealCard[]; canEdit: boolean; onAccept: (id: string) => void; onReject: (id: string, spam: boolean) => void }) {
  return (
    <section className="flex w-72 shrink-0 flex-col rounded-2xl border-2 border-dashed border-wine/30 bg-rose/30 p-2" data-stage="Неразобранное">
      <header className="px-2 pt-1 pb-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <Inbox className="size-4 text-wine" /> Неразобранное
          </h2>
          <span className="text-xs text-muted tabular-nums">{cards.length}</span>
        </div>
        <div className="text-xs text-muted">новые номера — принять или отклонить</div>
      </header>
      <div className="flex max-h-[calc(100dvh-17rem)] min-h-24 flex-col gap-2 overflow-y-auto pr-0.5">
        {cards.map((c) => (
          <div key={c.id} className="rounded-xl border border-line bg-white p-3 text-sm shadow-sm" data-deal={c.number} data-unsorted="1">
            <Card card={c} draggable={canEdit} bare />
            {canEdit ? (
              <div className="mt-2 flex gap-1.5 border-t border-line pt-2">
                <button className="btn btn-sm h-8 flex-1" onClick={() => onAccept(c.id)}>
                  <Check className="size-3.5" /> Принять
                </button>
                <button className="btn btn-ghost btn-sm h-8 px-2" onClick={() => onReject(c.id, false)} title="Отклонить">
                  <X className="size-3.5" />
                </button>
                <button className="btn btn-ghost btn-sm h-8 px-2 text-red-700" onClick={() => onReject(c.id, true)} title="Спам">
                  <Ban className="size-3.5" />
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function Column({ stage, cards, draggable }: { stage: Stage; cards: DealCard[]; draggable: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const sum = cards.reduce((s, c) => s + c.amount, 0);
  return (
    <section ref={setNodeRef} className={cn("flex w-72 shrink-0 flex-col rounded-2xl bg-[#efe9df] p-2 transition", isOver && "ring-2 ring-wine/50")} data-stage={stage.name}>
      <header className="px-2 pt-1 pb-3">
        <div className="mb-2 h-1 rounded-full" style={{ background: stage.color }} />
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="truncate text-sm font-semibold">{stage.name}</h2>
          <span className="shrink-0 text-xs text-muted tabular-nums">{cards.length}</span>
        </div>
        <div className="text-xs text-muted tabular-nums">{sum ? formatPrice(sum) : "—"}</div>
      </header>
      <div className="flex max-h-[calc(100dvh-17rem)] min-h-24 flex-col gap-2 overflow-y-auto pr-0.5">
        {cards.map((c) => (
          <Card key={c.id} card={c} draggable={draggable} />
        ))}
      </div>
    </section>
  );
}

function Card({ card: c, draggable, bare }: { card: DealCard; draggable: boolean; bare?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: c.id, disabled: !draggable });
  return (
    <article
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={cn(!bare && "rounded-xl border border-line bg-white p-3 shadow-sm", "text-sm", draggable && "cursor-grab active:cursor-grabbing", isDragging && "z-10 rotate-1 bg-white shadow-lift")}
      data-deal={bare ? undefined : c.number}
    >
      <div className="flex items-start justify-between gap-2">
        <Link href={`/admin/deals/${c.id}`} className="min-w-0 font-medium hover:text-wine" onPointerDown={(e) => e.stopPropagation()}>
          {c.title}
        </Link>
        {c.unread ? (
          <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            <MessageCircle className="size-3" /> {c.unread}
          </span>
        ) : null}
      </div>
      <div className="mt-0.5 truncate text-xs text-muted">
        №{c.number}
        {c.contactName ? ` · ${c.contactName}` : ""} · {c.source}
      </div>
      {c.book ? (
        <div className="mt-2 flex items-center gap-1.5" title={`Книга: ${c.book.answered} из ${c.book.total} ответов`}>
          <BookOpen className="size-3 text-muted" />
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-cream">
            <div className="h-full rounded-full bg-wine" style={{ width: `${c.book.total ? Math.round((c.book.answered / c.book.total) * 100) : 0}%` }} />
          </div>
          <span className="text-[10px] text-muted tabular-nums">
            {c.book.answered}/{c.book.total}
          </span>
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {c.amount ? <span className="text-xs font-medium tabular-nums">{formatPrice(c.amount)}</span> : null}
        {c.paid ? (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-800 tabular-nums" title="Получено платежами">
            получено {formatPrice(c.paid)}
          </span>
        ) : null}
        {c.eventDate ? <EventChip date={c.eventDate} /> : null}
        {c.task ? (
          <span className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]", c.task.overdue ? "bg-red-100 text-red-700" : "bg-cream text-ink-soft")}>
            <CalendarClock className="size-3" /> {c.task.label}
          </span>
        ) : (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800" title="У сделки нет запланированной задачи">
            нет задачи
          </span>
        )}
        {c.tags.slice(0, 2).map((t) => (
          <span key={t} className="rounded-full bg-rose px-2 py-0.5 text-[11px] text-wine">
            {t}
          </span>
        ))}
        <span className="ml-auto flex items-center gap-1.5">
          {c.daysInStage > 0 ? <span className="text-[11px] text-muted">{c.daysInStage} дн.</span> : null}
          {c.assigneeLabel ? (
            <span className="flex size-6 items-center justify-center rounded-full bg-ink text-[10px] font-semibold text-white uppercase" title={c.assigneeLabel}>
              {c.assigneeLabel.slice(0, 2)}
            </span>
          ) : (
            <span className="flex size-6 items-center justify-center rounded-full border border-dashed border-muted/50 text-[10px] text-muted" title="Не назначен">
              ?
            </span>
          )}
        </span>
      </div>
    </article>
  );
}

export function LostDialog({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4" onClick={onCancel}>
      <form
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (reason.trim()) onSubmit(reason.trim());
        }}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Причина отказа</h3>
          <button type="button" onClick={onCancel} aria-label="Закрыть">
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {lostReasons.map((r) => (
            <button type="button" key={r} onClick={() => setReason(r)} className={cn("rounded-full border px-2.5 py-1 text-xs", reason === r ? "border-ink bg-ink text-white" : "border-line hover:bg-cream")}>
              {r}
            </button>
          ))}
        </div>
        <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Или своими словами" className="input mt-3 h-10 text-sm" />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
            Отмена
          </button>
          <button className="btn btn-sm" disabled={!reason.trim()}>
            Закрыть сделку
          </button>
        </div>
      </form>
    </div>
  );
}

/** Дата события клиента: чем ближе, тем заметнее — книгу надо успеть напечатать. */
function EventChip({ date }: { date: string }) {
  const [y, m, d] = date.split("-").map(Number);
  const days = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())) / 86_400_000);
  const label = `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}`;
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px]", days < 0 ? "bg-cream text-muted" : days <= 14 ? "bg-red-100 text-red-700" : "bg-violet-50 text-violet-800")} title={days >= 0 ? `Событие через ${days} дн.` : "Событие прошло"}>
      🎉 {label}
      {days >= 0 && days <= 30 ? ` · ${days} дн.` : ""}
    </span>
  );
}
