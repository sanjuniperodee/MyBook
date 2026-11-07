"use client";

import { initialsOf } from "@/app/admin/deals/ui";
import { ask } from "@/components/ui/overlays";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { DndContext, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { CalendarClock, CircleDollarSign, Gift, Zap } from "lucide-react";
import { moveOrderAction } from "../actions";
import { orderStatusDot, orderStatusLabels } from "@/modules/ordering/ui/status";
import { Alert } from "@/components/ui/Alert";
import type { OrderStatus } from "@/shared/domain/orders";
import { cn } from "@/lib/class-names";
import { formatPrice } from "@/config/site";
import { OrdersViews } from "../orders/OrdersViews";

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
  /** Сумма заказа в тенге — для итога колонки. */
  amount: number;
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
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
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
        <OrdersViews active="board" className="ml-auto" />
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
export const urgency = (c: BoardCard) => (c.daysLeft === null || c.status === "delivered" || c.status === "shipped" ? null : c.daysLeft < 0 ? "danger" : c.daysLeft <= 3 ? "warning" : null);

/** Подпись срока на карточке: «просрочен на 3 дн.», «нужна сегодня», «через 12 дн.». */
// Отправленному и доставленному срок не пишем: «просрочен на 22 дн.» у доставленной книги читалось как тревога.
export const dueText = (c: BoardCard) => (c.daysLeft === null || c.status === "delivered" || c.status === "shipped" ? null : c.daysLeft < 0 ? `просрочен на ${-c.daysLeft} дн.` : c.daysLeft === 0 ? "нужна сегодня" : `через ${c.daysLeft} дн.`);

/** Порядок в колонке: сначала те, у кого срок ближе; без срока — после, в прежнем порядке. */
const byDeadline = (a: BoardCard, b: BoardCard) => (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity);

function Column({ status, hint, cards }: { status: OrderStatus; hint: string; cards: BoardCard[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const sorted = status === "delivered" ? cards : [...cards].sort(byDeadline);
  const hot = cards.filter((c) => urgency(c)).length;
  const sum = cards.reduce((s, c) => s + c.amount, 0);
  return (
    <section
      ref={setNodeRef}
      aria-label={orderStatusLabels[status]}
      // Пустая колонка уже: место — колонкам, где есть заказы (пустая остаётся целью для перетаскивания).
      className={cn("flex min-w-[12.5rem] basis-0 flex-col rounded-[var(--r-panel)]", cards.length ? "flex-[1.4]" : "flex-1", "border border-transparent bg-sunken/70 transition-colors", isOver && "border-wine/50 bg-rose/40")}
    >
      <header className="px-3 pt-3 pb-2.5">
        <div className="flex items-center gap-2">
          <span className={cn("size-2 rounded-full", orderStatusDot[status])} aria-hidden />
          <h2 className="text-sm font-semibold">{orderStatusLabels[status]}</h2>
          <span className="count ml-auto">{cards.length}</span>
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-2 pl-4 text-xs text-muted">
          <span className="truncate">
            {hint}
            {hot ? <span className="font-medium text-danger">, срочных {hot}</span> : null}
          </span>
          <span className="shrink-0 font-medium text-ink-soft tabular-nums">{sum ? formatPrice(sum) : ""}</span>
        </div>
      </header>
      <div className="flex max-h-[calc(100dvh-15rem)] min-h-24 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {sorted.map((c) => (
          <Card key={c.id} card={c} />
        ))}
        {cards.length === 0 ? <p className="flex flex-1 items-center justify-center rounded-[var(--r-ctl)] border border-dashed border-line-strong/70 px-3 py-6 text-center text-xs text-muted">Пусто. Перетащите сюда заказ</p> : null}
      </div>
    </section>
  );
}

function Card({ card: c }: { card: BoardCard }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: c.id });
  const urgent = urgency(c);
  const due = dueText(c);
  return (
    <article
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={cn(
        "relative shrink-0 cursor-grab overflow-hidden rounded-[var(--r-ctl)] border border-line bg-white p-3 text-sm transition-shadow hover:border-line-strong active:cursor-grabbing",
        isDragging && "z-10 rotate-1 shadow-lift",
      )}
    >
      {/* Полоска срочности слева: красная — просрочен, янтарная — до 3 дней. */}
      {urgent ? <span className={cn("absolute inset-y-0 left-0 w-[3px]", urgent === "danger" ? "bg-danger" : "bg-warning")} aria-hidden /> : null}
      <div className="flex items-baseline justify-between gap-2">
        <Link href={`/admin/orders/${c.id}`} className="font-semibold tabular-nums hover:text-wine hover:underline" onPointerDown={(e) => e.stopPropagation()}>
          №{c.number}
        </Link>
        <span className="text-[13px] tabular-nums text-ink-soft">{c.amountLabel}</span>
      </div>
      <div className="mt-0.5 truncate font-medium">{c.contactName}</div>
      <div className="truncate text-xs text-muted">
        {c.planName}
        {c.quantity > 1 ? ` × ${c.quantity}` : ""}
        {c.printed ? "" : ", электронная"}
        {", "}
        {c.ageDays ? `${c.ageDays} дн. назад` : "сегодня"}
      </div>
      <div className="mt-2 flex items-center gap-2">
        {due ? (
          <span className={cn("inline-flex min-w-0 items-center gap-1 text-xs", urgent === "danger" ? "font-medium text-danger" : urgent === "warning" ? "font-medium text-warning" : "text-muted")}>
            <CalendarClock className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{due}</span>
          </span>
        ) : (
          <span className="text-xs text-muted">срок не указан</span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-muted">
          {c.express ? <Zap className="size-3.5 text-danger" aria-label="Срочное производство" role="img" /> : null}
          {c.claimed ? <CircleDollarSign className="size-3.5 text-warning" aria-label="Клиент сообщил об оплате" role="img" /> : null}
          {c.giftNote || c.surprise ? <Gift className="size-3.5 text-wine" aria-label={c.surprise ? "Сюрприз" : "Открытка"} role="img" /> : null}
          {c.dealNumber ? (
            <span className="text-[11px] font-medium" title="Сделка заказа">
              Д{c.dealNumber}
            </span>
          ) : null}
          {c.assigneeLabel ? (
            <span className="flex size-6 items-center justify-center rounded-full bg-ink text-[10px] font-semibold text-white uppercase" title={c.assigneeLabel} aria-label={`Ведёт ${c.assigneeLabel}`}>
              {initialsOf(c.assigneeLabel)}
            </span>
          ) : null}
        </span>
      </div>
    </article>
  );
}
