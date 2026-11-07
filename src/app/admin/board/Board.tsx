"use client";

import { ask } from "@/components/ui/overlays";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { DndContext, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { CalendarClock, CircleDollarSign, Gift, Inbox, Zap } from "lucide-react";
import { moveOrderAction } from "../actions";
import { orderStatusDot, orderStatusLabels } from "@/modules/ordering/ui/status";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import type { OrderStatus } from "@/shared/domain/orders";
import { cn } from "@/lib/class-names";

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
  express: boolean;
  assigneeId: string | null;
  assigneeLabel: string | null;
  ageDays: number;
  /** Номер сделки заказа (deals-14). */
  dealNumber?: number | null;
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
  // Next не пересоздаёт доску при новых данных с сервера (router.refresh(), ответ действия) — берём новый список сами.
  const [shown, setShown] = useState(initial);
  if (shown !== initial) {
    setShown(initial);
    setCards(initial);
  }
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

  const onDragEnd = async (e: DragEndEvent) => {
    const id = String(e.active.id);
    const to = e.over?.id as OrderStatus | undefined;
    const card = cards.find((c) => c.id === id);
    if (!card || !to || card.status === to) return;
    if (to === "shipped" && card.printed && !(await ask(`Заказ №${card.number} отправлен? Клиент получит письмо. Трек-номер можно добавить в карточке заказа.`))) return;
    // Откат — только этой карточки: остальные за это время могли обновиться с сервера.
    const revert = () => setCards((cs) => cs.map((c) => (c.id === id ? card : c)));
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, status: to, claimed: false } : c)));
    setError(null);
    start(async () => {
      try {
        const r = await moveOrderAction(id, to);
        if (r.error) {
          revert();
          setError(r.error);
        }
      } catch (err) {
        revert();
        setError((err as Error).message);
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Чьи заказы показать">
        {[
          ["all", "Все"],
          ["mine", "Мои"],
          ["none", "Без ответственного"],
          ...admins.filter((a) => a.id !== me).map((a) => [a.id, a.label]),
        ].map(([k, label]) => (
          <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k} className="chip">
            {label}
          </button>
        ))}
      </div>
      {error ? <Alert>{error}</Alert> : null}
      <DndContext id="orders-board" sensors={sensors} onDragEnd={onDragEnd}>
        <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 2xl:-mx-8 2xl:px-8">
          {columns.map((col) => (
            <Column key={col.status} status={col.status} hint={col.hint} cards={visible.filter((c) => c.status === col.status)} />
          ))}
        </div>
      </DndContext>
    </div>
  );
}

/** Срочность карточки: просрочен, ≤ 3 дней — в работе это важнее даты создания. Доставленным и отправленным срок уже не грозит. */
const urgency = (c: BoardCard) => (c.daysLeft === null || c.status === "delivered" || c.status === "shipped" ? null : c.daysLeft < 0 ? "danger" : c.daysLeft <= 3 ? "warning" : null);

/** Порядок в колонке: сначала те, у кого срок ближе; без срока — после, в прежнем порядке. */
const byDeadline = (a: BoardCard, b: BoardCard) => (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity);

function Column({ status, hint, cards }: { status: OrderStatus; hint: string; cards: BoardCard[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const sorted = status === "delivered" ? cards : [...cards].sort(byDeadline);
  const hot = cards.filter((c) => urgency(c)).length;
  return (
    <section
      ref={setNodeRef}
      aria-label={orderStatusLabels[status]}
      className={cn("flex min-w-[13.5rem] flex-1 basis-0 flex-col rounded-[14px] border border-line bg-sunken/70 transition-colors", isOver && "border-wine/50 bg-rose/40")}
    >
      <header className="px-3 pt-3 pb-2.5">
        <div className="flex items-center gap-2">
          <span className={cn("size-2 rounded-full", orderStatusDot[status])} aria-hidden />
          <h2 className="text-sm font-semibold">{orderStatusLabels[status]}</h2>
          <span className="ml-auto text-sm font-medium text-ink-soft tabular-nums">{cards.length}</span>
        </div>
        <p className="mt-0.5 pl-4 text-xs text-muted">
          {hint}
          {hot ? <span className="font-medium text-danger">, срочных {hot}</span> : null}
        </p>
      </header>
      <div className="flex max-h-[calc(100dvh-17rem)] min-h-28 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {sorted.map((c) => (
          <Card key={c.id} card={c} />
        ))}
        {cards.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 rounded-[10px] border border-dashed border-line-strong/70 px-3 py-6 text-center text-xs text-muted">
            <Inbox className="size-4" aria-hidden />
            Перетащите сюда заказ
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Card({ card: c }: { card: BoardCard }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: c.id });
  const urgent = urgency(c);
  return (
    <article
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={cn(
        "relative cursor-grab overflow-hidden rounded-[10px] border border-line bg-white p-3 text-sm transition-shadow hover:border-line-strong active:cursor-grabbing",
        isDragging && "z-10 rotate-1 shadow-lift",
      )}
    >
      {/* Полоска срочности слева: красная — просрочен, янтарная — до 3 дней. */}
      {urgent ? <span className={cn("absolute inset-y-0 left-0 w-[3px]", urgent === "danger" ? "bg-danger" : "bg-warning")} aria-hidden /> : null}
      <div className="flex items-baseline justify-between gap-2">
        <Link href={`/admin/orders/${c.id}`} className="font-semibold tabular-nums hover:text-wine hover:underline" onPointerDown={(e) => e.stopPropagation()}>
          №{c.number}
        </Link>
        <span className="text-[13px] font-medium tabular-nums">{c.amountLabel}</span>
      </div>
      <div className="mt-0.5 truncate font-medium">{c.contactName}</div>
      <div className="mt-0.5 truncate text-xs text-muted">
        {c.planName}
        {c.quantity > 1 ? ` × ${c.quantity}` : ""}
        {c.printed ? "" : ", электронная"}
        {", "}
        {c.ageDays ? `${c.ageDays} дн. назад` : "сегодня"}
      </div>
      {c.claimed || (c.desiredDate && c.daysLeft !== null) || c.express || c.giftNote || c.surprise || c.dealNumber || c.assigneeLabel ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-1">
          {c.desiredDate && c.daysLeft !== null ? (
            <Badge tone={urgent ?? "neutral"}>
              <CalendarClock className="size-3" aria-hidden />
              {c.daysLeft < 0 ? `просрочен на ${-c.daysLeft} дн.` : c.daysLeft === 0 ? "нужна сегодня" : `через ${c.daysLeft} дн.`}
            </Badge>
          ) : null}
          {c.express ? (
            <Badge tone="danger">
              <Zap className="size-3" aria-hidden /> срочно
            </Badge>
          ) : null}
          {c.claimed ? (
            <Badge tone="warning">
              <CircleDollarSign className="size-3" aria-hidden /> оплатил
            </Badge>
          ) : null}
          {c.giftNote || c.surprise ? (
            <Badge tone="accent">
              <Gift className="size-3" aria-hidden /> {c.surprise ? "сюрприз" : "открытка"}
            </Badge>
          ) : null}
          {c.dealNumber ? (
            <Badge title="Сделка заказа">Д{c.dealNumber}</Badge>
          ) : null}
          {c.assigneeLabel ? (
            <span className="ml-auto flex size-6 items-center justify-center rounded-full bg-ink text-[10px] font-semibold text-white uppercase" title={c.assigneeLabel} aria-label={`Ведёт ${c.assigneeLabel}`}>
              {c.assigneeLabel.slice(0, 2)}
            </span>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
