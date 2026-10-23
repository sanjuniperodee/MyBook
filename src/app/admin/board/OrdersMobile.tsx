"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarClock, CircleDollarSign, Gift, Heart, Search, User, Zap } from "lucide-react";
import { orderStatusLabels } from "@/modules/ordering/ui/status";
import type { OrderStatus } from "@/shared/domain/orders";
import { cn } from "@/lib/class-names";
import type { BoardCard } from "./Board";

const STATUSES: OrderStatus[] = ["pending_payment", "paid", "in_production", "shipped", "delivered"];
const DOT: Record<string, string> = { pending_payment: "bg-amber-500", paid: "bg-emerald-500", in_production: "bg-sky-500", shipped: "bg-indigo-500", delivered: "bg-stone-400", cancelled: "bg-red-500" };

/**
 * Заказы на телефоне — как экран «Заказы» в приложении: статусы-«пилюли» со счётчиками, карточки с признаками «срочно»,
 * «сюрприз», «сообщил об оплате» и сроком; нажатие открывает заказ, где статус меняется. Перетаскивание карточек
 * (доска) остаётся на больших экранах.
 */
export function OrdersMobile({ cards }: { cards: BoardCard[] }) {
  // Открываем первый статус, где есть заказы: пустой «Оплачен» по умолчанию выглядел как «заказов нет».
  const [status, setStatus] = useState<OrderStatus>(() => (["paid", "in_production", "pending_payment", "shipped", "delivered"] as OrderStatus[]).find((s) => cards.some((c) => c.status === s)) ?? "paid");
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const list = cards.filter((c) => c.status === status && (!needle || `${c.number} ${c.contactName}`.toLowerCase().includes(needle)));
  return (
    <div className="space-y-3 lg:hidden" data-testid="orders-mobile">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Номер или получатель" className="h-11 w-full rounded-full bg-cream/70 pr-4 pl-10 text-[15px] outline-none placeholder:text-muted focus:bg-white focus:ring-2 focus:ring-wine/20" />
      </div>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1" data-no-ptr>
        {STATUSES.map((s) => {
          const n = cards.filter((c) => c.status === s).length;
          return (
            <button key={s} type="button" onClick={() => setStatus(s)} className={cn("flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition", status === s ? "bg-wine/10 text-wine" : "bg-cream/70 text-ink-soft")}>
              <span className={cn("size-2 rounded-full", DOT[s])} />
              {orderStatusLabels[s]}
              <span className="text-xs opacity-70 tabular-nums">{n}</span>
            </button>
          );
        })}
      </div>
      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-white px-4 py-10 text-center text-sm text-muted">Здесь пусто — заказов в этом статусе за 30 дней нет</p>
      ) : (
        <ul className="space-y-2.5">
          {list.map((c) => {
            const urgent = c.daysLeft !== null && c.daysLeft <= 3 && c.status !== "delivered" && c.status !== "shipped";
            return (
              <li key={c.id}>
                <Link href={`/admin/orders/${c.id}`} className="block rounded-2xl border border-line bg-white p-3.5 shadow-soft active:scale-[0.99]">
                  <div className="flex items-start gap-3">
                    <span className={cn("mt-0.5 h-10 w-1 shrink-0 rounded-full", DOT[c.status])} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[16px] font-semibold">
                        №{c.number} · {c.contactName}
                      </div>
                      <div className="truncate text-sm text-muted">
                        {c.planName}
                        {c.quantity > 1 ? ` × ${c.quantity}` : ""}
                        {c.printed ? "" : " · электронная"}
                      </div>
                    </div>
                    <div className="text-[15px] font-semibold whitespace-nowrap tabular-nums">{c.amountLabel}</div>
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-1.5 text-xs font-medium">
                    {c.express ? (
                      <span className="flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-red-700">
                        <Zap className="size-3" /> срочно
                      </span>
                    ) : null}
                    {c.claimed ? (
                      <span className="flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-amber-800">
                        <CircleDollarSign className="size-3" /> клиент сообщил об оплате
                      </span>
                    ) : null}
                    {c.surprise ? (
                      <span className="flex items-center gap-1 rounded-md bg-violet-50 px-2 py-1 text-violet-700">
                        <Gift className="size-3" /> сюрприз
                      </span>
                    ) : null}
                    {c.giftNote ? (
                      <span className="flex items-center gap-1 rounded-md bg-violet-50 px-2 py-1 text-violet-700">
                        <Heart className="size-3" /> открытка
                      </span>
                    ) : null}
                    {c.daysLeft !== null ? (
                      <span className={cn("flex items-center gap-1 rounded-md px-2 py-1", urgent ? "bg-red-50 text-red-700" : "bg-cream text-ink-soft")}>
                        <CalendarClock className="size-3" />
                        {c.daysLeft < 0 ? `просрочен на ${-c.daysLeft} дн.` : c.daysLeft === 0 ? "нужен сегодня" : `нужен через ${c.daysLeft} дн.`}
                      </span>
                    ) : null}
                    {c.dealNumber ? <span className="rounded-md bg-cream px-2 py-1 text-ink-soft">Сделка №{c.dealNumber}</span> : null}
                    {c.assigneeLabel ? (
                      <span className="flex items-center gap-1 rounded-md bg-cream px-2 py-1 text-ink-soft">
                        <User className="size-3" /> {c.assigneeLabel}
                      </span>
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
