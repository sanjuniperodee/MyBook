"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CalendarClock, CircleDollarSign, Gift, Heart, Inbox, Search, User, Zap } from "lucide-react";
import { orderStatusDot, orderStatusLabels } from "@/modules/ordering/ui/status";
import type { OrderStatus } from "@/shared/domain/orders";
import { cn } from "@/lib/class-names";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import type { BoardCard } from "./Board";

const STATUSES: OrderStatus[] = ["pending_payment", "paid", "in_production", "shipped", "delivered"];

/**
 * Производство на телефоне: статусы — лентой вкладок со счётчиками, под ними список одним листом, срочные — сверху и с
 * полоской срока; нажатие открывает заказ, где статус меняется. Перетаскивание карточек (доска) — на больших экранах.
 */
export function OrdersMobile({ cards }: { cards: BoardCard[] }) {
  // Открываем первый статус, где есть заказы: пустой «Оплачен» по умолчанию выглядел как «заказов нет».
  const [status, setStatus] = useState<OrderStatus>(() => (["paid", "in_production", "pending_payment", "shipped", "delivered"] as OrderStatus[]).find((s) => cards.some((c) => c.status === s)) ?? "paid");
  const [q, setQ] = useState("");
  // Выбранная вкладка — в поле зрения ленты (иначе «В производстве» открыта, но уехала за край).
  const active = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    active.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [status]);
  const needle = q.trim().toLowerCase();
  const list = cards
    .filter((c) => c.status === status && (!needle || `${c.number} ${c.contactName}`.toLowerCase().includes(needle)))
    .sort((a, b) => (status === "delivered" ? 0 : (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity)));
  return (
    <div className="space-y-3 lg:hidden" data-testid="orders-mobile">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Номер или получатель" aria-label="Найти заказ: номер или получатель" type="search" className="input pl-10" />
      </div>
      <div className="m-hscroll flex gap-1.5" role="tablist" aria-label="Статус" data-no-ptr>
        {STATUSES.map((s) => {
          const n = cards.filter((c) => c.status === s).length;
          const on = status === s;
          return (
            <button key={s} ref={on ? active : undefined} type="button" role="tab" aria-selected={on} onClick={() => setStatus(s)} className={cn("chip h-10", on && "chip-on")}>
              <span className={cn("size-1.5 rounded-full", on ? "bg-current" : orderStatusDot[s])} aria-hidden />
              {orderStatusLabels[s]}
              <span className={cn("text-xs tabular-nums", on ? "opacity-80" : "text-muted")}>{n}</span>
            </button>
          );
        })}
      </div>
      {list.length === 0 ? (
        <div className="panel">
          <EmptyState compact icon={Inbox} title={needle ? "Ничего не нашлось" : `«${orderStatusLabels[status]}»: пусто`}>
            {needle ? "Проверьте номер или имя получателя." : "Заказов в этом статусе за 30 дней нет. Загляните в соседние вкладки."}
          </EmptyState>
        </div>
      ) : (
        <ul className="panel divide-y divide-line overflow-hidden">
          {list.map((c) => {
            const urgent = c.daysLeft !== null && c.daysLeft <= 3 && c.status !== "delivered" && c.status !== "shipped";
            return (
              <li key={c.id}>
                <Link href={`/admin/orders/${c.id}`} className="m-card relative block px-4 py-3.5">
                  {urgent ? <span className={cn("absolute inset-y-0 left-0 w-[3px]", c.daysLeft! < 0 ? "bg-danger" : "bg-warning")} aria-hidden /> : null}
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-semibold">
                        <span className="tabular-nums">№{c.number}</span> <span className="font-medium">{c.contactName}</span>
                      </div>
                      <div className="truncate text-sm text-muted">
                        {c.planName}
                        {c.quantity > 1 ? ` × ${c.quantity}` : ""}
                        {c.printed ? "" : ", электронная"}
                      </div>
                    </div>
                    <div className="text-[15px] font-semibold whitespace-nowrap tabular-nums">{c.amountLabel}</div>
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {c.daysLeft !== null ? (
                      <Badge tone={urgent ? (c.daysLeft < 0 ? "danger" : "warning") : "neutral"}>
                        <CalendarClock className="size-3" aria-hidden />
                        {c.daysLeft < 0 ? `просрочен на ${-c.daysLeft} дн.` : c.daysLeft === 0 ? "нужен сегодня" : `нужен через ${c.daysLeft} дн.`}
                      </Badge>
                    ) : null}
                    {c.express ? (
                      <Badge tone="danger">
                        <Zap className="size-3" aria-hidden /> срочно
                      </Badge>
                    ) : null}
                    {c.claimed ? (
                      <Badge tone="warning">
                        <CircleDollarSign className="size-3" aria-hidden /> клиент сообщил об оплате
                      </Badge>
                    ) : null}
                    {c.surprise ? (
                      <Badge tone="accent">
                        <Gift className="size-3" aria-hidden /> сюрприз
                      </Badge>
                    ) : null}
                    {c.giftNote ? (
                      <Badge tone="accent">
                        <Heart className="size-3" aria-hidden /> открытка
                      </Badge>
                    ) : null}
                    {c.dealNumber ? <Badge>Сделка №{c.dealNumber}</Badge> : null}
                    {c.assigneeLabel ? (
                      <Badge>
                        <User className="size-3" aria-hidden /> {c.assigneeLabel}
                      </Badge>
                    ) : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
