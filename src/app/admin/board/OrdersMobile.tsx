"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CalendarClock, CircleDollarSign, Gift, Inbox, Search, Zap } from "lucide-react";
import { orderStatusDot, orderStatusLabels } from "@/modules/ordering/ui/status";
import type { OrderStatus } from "@/shared/domain/orders";
import { cn } from "@/lib/class-names";
import { formatPrice } from "@/config/site";
import { EmptyState } from "@/components/ui/EmptyState";
import { dueText, urgency, type BoardCard } from "./Board";

const STATUSES: OrderStatus[] = ["pending_payment", "paid", "in_production", "shipped", "delivered"];

/**
 * Производство на телефоне — переключатель статуса и лента: статусы лентой вкладок со счётчиками, под ними итог выбранного
 * статуса и список одним листом, срочные — сверху и с полоской срока; нажатие открывает заказ, где статус меняется.
 * Перетаскивание карточек (доска) — на больших экранах.
 */
export function OrdersMobile({ cards, me }: { cards: BoardCard[]; me: string }) {
  // Открываем первый статус, где есть заказы: пустой «Оплачен» по умолчанию выглядел как «заказов нет».
  const [status, setStatus] = useState<OrderStatus>(() => (["paid", "in_production", "pending_payment", "shipped", "delivered"] as OrderStatus[]).find((s) => cards.some((c) => c.status === s)) ?? "paid");
  const [q, setQ] = useState("");
  const [mine, setMine] = useState(false);
  // Выбранная вкладка — в поле зрения ленты (иначе «В производстве» открыта, но уехала за край).
  const active = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    active.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [status]);
  const needle = q.trim().toLowerCase();
  const scope = mine ? cards.filter((c) => c.assigneeId === me) : cards;
  const list = scope
    .filter((c) => c.status === status && (!needle || `${c.number} ${c.contactName}`.toLowerCase().includes(needle)))
    .sort((a, b) => (status === "delivered" ? 0 : (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity)));
  const sum = list.reduce((s, c) => s + c.amount, 0);
  return (
    <div className="space-y-3 lg:hidden" data-testid="orders-mobile">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Номер или получатель" aria-label="Найти заказ: номер или получатель" type="search" className="input pl-10" />
        </div>
        <button type="button" onClick={() => setMine((v) => !v)} aria-pressed={mine} className="chip h-11 shrink-0">
          Мои
        </button>
      </div>
      <div className="m-hscroll flex gap-1.5" role="tablist" aria-label="Статус" data-no-ptr>
        {STATUSES.map((s) => {
          const n = scope.filter((c) => c.status === s).length;
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
        <>
          <p className="px-1 text-[13px] text-muted tabular-nums" aria-live="polite">
            {list.length} в статусе «{orderStatusLabels[status]}»{sum ? `, на ${formatPrice(sum)}` : ""}
          </p>
          <ul className="panel divide-y divide-line overflow-hidden">
            {list.map((c) => {
              const urgent = urgency(c);
              const due = dueText(c);
              return (
                <li key={c.id}>
                  <Link href={`/admin/orders/${c.id}`} className="m-card relative block px-4 py-3.5">
                    {urgent ? <span className={cn("absolute inset-y-0 left-0 w-[3px]", urgent === "danger" ? "bg-danger" : "bg-warning")} aria-hidden /> : null}
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
                    <div className="mt-2 flex items-center gap-2 text-[13px]">
                      {due ? (
                        <span className={cn("inline-flex min-w-0 items-center gap-1", urgent === "danger" ? "font-medium text-danger" : urgent === "warning" ? "font-medium text-warning" : "text-muted")}>
                          <CalendarClock className="size-3.5 shrink-0" aria-hidden />
                          <span className="truncate">{due}</span>
                        </span>
                      ) : (
                        <span className="text-muted">срок не указан</span>
                      )}
                      <span className="ml-auto flex shrink-0 items-center gap-2 text-muted">
                        {c.express ? <Zap className="size-4 text-danger" aria-label="Срочное производство" role="img" /> : null}
                        {c.claimed ? <CircleDollarSign className="size-4 text-warning" aria-label="Клиент сообщил об оплате" role="img" /> : null}
                        {c.giftNote || c.surprise ? <Gift className="size-4 text-wine" aria-label={c.surprise ? "Сюрприз" : "Открытка"} role="img" /> : null}
                        {c.dealNumber ? <span className="text-xs">Сделка №{c.dealNumber}</span> : null}
                        {c.assigneeLabel ? <span className="max-w-28 truncate text-xs">{c.assigneeLabel}</span> : null}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
