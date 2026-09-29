"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { DndContext, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { CalendarClock, CircleDollarSign, Gift } from "lucide-react";
import { moveOrderAction } from "../actions";
import { orderStatusLabels } from "@/lib/orders-shared";
import type { OrderStatus } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

export interface BoardCard {
  id: string;
  number: number;
  status: OrderStatus;
  contactName: string;
  plan: string;
  planName: string;
  printed: boolean;
  quantity: number;
  amountLabel: string;
  desiredDate: string | null;
  daysLeft: number | null;
  claimed: boolean;
  surprise: boolean;
  giftNote: boolean;
  assigneeId: string | null;
  assigneeLabel: string | null;
  ageDays: number;
}

const columns: { status: OrderStatus; hint: string }[] = [
  { status: "pending_payment", hint: "ждём оплату" },
  { status: "paid", hint: "передать в печать" },
  { status: "in_production", hint: "печатается" },
  { status: "shipped", hint: "в доставке" },
  { status: "delivered", hint: "за 30 дней" },
];

export function Board({ initial, admins, me }: { initial: BoardCard[]; admins: { id: string; label: string }[]; me: string }) {
  const [cards, setCards] = useState(initial);
  const [filter, setFilter] = useState<"all" | "mine" | "none" | string>("all");
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }));

  const visible = useMemo(
    () =>
      cards.filter((c) =>
        filter === "all" ? true : filter === "mine" ? c.assigneeId === me : filter === "none" ? !c.assigneeId : c.assigneeId === filter,
      ),
    [cards, filter, me],
  );

  const onDragEnd = (e: DragEndEvent) => {
    const id = String(e.active.id);
    const to = e.over?.id as OrderStatus | undefined;
    const card = cards.find((c) => c.id === id);
    if (!card || !to || card.status === to) return;
    if (to === "shipped" && card.printed && !confirm(`Заказ №${card.number} отправлен? Клиент получит письмо. Трек-номер можно добавить в карточке заказа.`)) return;
    const prev = cards;
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, status: to, claimed: false } : c)));
    setError(null);
    start(async () => {
      try {
        await moveOrderAction(id, to);
      } catch (err) {
        setCards(prev);
        setError((err as Error).message);
      }
    });
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {[
          ["all", "Все"],
          ["mine", "Мои"],
          ["none", "Без ответственного"],
          ...admins.filter((a) => a.id !== me).map((a) => [a.id, a.label]),
        ].map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)} className={cn("rounded-full px-3 py-1.5 text-sm", filter === k ? "bg-ink text-white" : "bg-white text-ink-soft hover:bg-cream")}>
            {label}
          </button>
        ))}
        {error ? <span className="text-sm text-red-700">{error}</span> : null}
      </div>
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6">
          {columns.map((col) => (
            <Column key={col.status} status={col.status} hint={col.hint} cards={visible.filter((c) => c.status === col.status)} />
          ))}
        </div>
      </DndContext>
    </div>
  );
}

function Column({ status, hint, cards }: { status: OrderStatus; hint: string; cards: BoardCard[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section ref={setNodeRef} className={cn("flex w-72 shrink-0 flex-col rounded-2xl bg-[#efe9df] p-2 transition", isOver && "ring-2 ring-wine/50")}>
      <header className="flex items-baseline justify-between px-2 pt-1 pb-3">
        <h2 className="text-sm font-semibold">{orderStatusLabels[status]}</h2>
        <span className="text-xs text-muted">
          {cards.length} · {hint}
        </span>
      </header>
      <div className="flex max-h-[calc(100dvh-15rem)] min-h-24 flex-col gap-2 overflow-y-auto pr-0.5">
        {cards.map((c) => (
          <Card key={c.id} card={c} />
        ))}
      </div>
    </section>
  );
}

function Card({ card: c }: { card: BoardCard }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: c.id });
  return (
    <article
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={cn("cursor-grab rounded-xl border border-line bg-white p-3 text-sm shadow-sm active:cursor-grabbing", isDragging && "z-10 rotate-1 shadow-lift")}
    >
      <div className="flex items-center justify-between gap-2">
        <Link href={`/admin/orders/${c.id}`} className="font-semibold hover:text-wine" onPointerDown={(e) => e.stopPropagation()}>
          №{c.number}
        </Link>
        <span className="tabular-nums">{c.amountLabel}</span>
      </div>
      <div className="mt-1 truncate">{c.contactName}</div>
      <div className="mt-0.5 text-xs text-muted">
        {c.planName}
        {c.quantity > 1 ? ` × ${c.quantity}` : ""} · {c.ageDays ? `${c.ageDays} дн. назад` : "сегодня"}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {c.claimed ? (
          <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">
            <CircleDollarSign className="size-3" /> оплатил
          </span>
        ) : null}
        {c.desiredDate && c.daysLeft !== null ? (
          <span className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]", c.daysLeft < 0 ? "bg-red-100 text-red-700" : c.daysLeft <= 3 ? "bg-amber-100 text-amber-800" : "bg-cream text-ink-soft")}>
            <CalendarClock className="size-3" /> {c.daysLeft < 0 ? `просрочен` : c.daysLeft === 0 ? "сегодня" : `${c.daysLeft} дн.`}
          </span>
        ) : null}
        {c.giftNote || c.surprise ? (
          <span className="flex items-center gap-1 rounded-full bg-rose px-2 py-0.5 text-[11px] text-wine">
            <Gift className="size-3" /> {c.surprise ? "сюрприз" : "открытка"}
          </span>
        ) : null}
        {c.assigneeLabel ? (
          <span className="ml-auto flex size-6 items-center justify-center rounded-full bg-ink text-[10px] font-semibold text-white uppercase" title={c.assigneeLabel}>
            {c.assigneeLabel.slice(0, 2)}
          </span>
        ) : null}
      </div>
    </article>
  );
}
