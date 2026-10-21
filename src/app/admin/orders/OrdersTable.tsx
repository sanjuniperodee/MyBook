"use client";

import { ask } from "@/components/ui/overlays";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LoaderCircle } from "lucide-react";
import { bulkStatusAction } from "../actions";
import { orderStatusColors, orderStatusLabel, orderStatusLabels } from "@/modules/ordering/ui/status";
import { ORDER_STATUSES as orderStatuses, type OrderStatus } from "@/shared/domain/orders";
import { cn } from "@/lib/class-names";
import { useRowSelection } from "@/components/admin/useRowSelection";

export interface OrderRow {
  id: string;
  number: number;
  createdLabel: string;
  contactName: string;
  contactLine: string;
  planLabel: string;
  /** Печатный ли тариф: у электронной версии оплаченный заказ — «Выполнен», печати нет. */
  printed: boolean;
  desiredLabel: string | null;
  /** Полная цена книги (с предоплатой по сделке). */
  amountLabel: string;
  /** «оплачено X» или «долг Y»; null — бесплатный заказ без денег. */
  money: { kind: "paid" | "debt"; label: string } | null;
  status: OrderStatus;
  claimed: boolean;
  assignee: string | null;
  promoCode: string | null;
}

export function OrdersTable({ rows }: { rows: OrderRow[] }) {
  const { selected, all, ids, toggle, toggleAll, clear } = useRowSelection(rows);
  const [status, setStatus] = useState<OrderStatus>("in_production");
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  const apply = async () => {
    if (!(await ask(`Перевести ${selected.size} заказ(ов) в статус «${orderStatusLabels[status]}»? Клиенты получат письма.`))) return;
    start(async () => {
      try {
        const res = await bulkStatusAction(ids(), status);
        setMessage(`Обновлено заказов: ${res.count}${res.skipped ? `; пропущено ${res.skipped} — не оплачены (примите оплату или отправьте в печать с постоплатой)` : ""}`);
        clear();
        router.refresh();
      } catch (e) {
        setMessage((e as Error).message);
      }
    });
  };

  return (
    <div className="space-y-3">
      {selected.size ? (
        <div className="sticky top-16 z-20 flex flex-wrap items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-sm text-white shadow-lift">
          <span>Выбрано: {selected.size}</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as OrderStatus)} className="h-9 rounded-lg bg-white/10 px-2 text-white outline-none">
            {orderStatuses.map((s) => (
              <option key={s} value={s} className="text-ink">
                {orderStatusLabels[s]}
              </option>
            ))}
          </select>
          <button className="btn btn-sm bg-white text-ink hover:bg-paper" onClick={apply} disabled={pending}>
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : null} Применить
          </button>
          <button className="ml-auto text-white/70 hover:text-white" onClick={clear}>
            Снять выделение
          </button>
        </div>
      ) : null}
      {message ? <p className="text-sm text-muted">{message}</p> : null}
      {/* Телефон — карточки, как «Заказы» в приложении; таблица с выбором и массовой сменой статуса — на больших экранах. */}
      <ul className="space-y-2.5 lg:hidden" data-testid="orders-cards">
        {rows.map((o) => (
          <li key={o.id}>
            <Link href={`/admin/orders/${o.id}`} className="block rounded-2xl border border-line bg-white p-3.5 shadow-soft active:scale-[0.99]">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[16px] font-semibold">
                    №{o.number} · {o.contactName}
                  </div>
                  <div className="truncate text-sm text-muted">
                    {o.planLabel}
                    {o.printed ? "" : " · электронная"}
                  </div>
                  {o.contactLine ? <div className="truncate text-xs text-muted">{o.contactLine}</div> : null}
                </div>
                <div className="text-right">
                  <div className="text-[15px] font-semibold whitespace-nowrap tabular-nums">{o.amountLabel}</div>
                  {o.money ? <div className={cn("text-xs", o.money.kind === "debt" ? "font-medium text-red-700" : "text-emerald-700")}>{o.money.label}</div> : null}
                </div>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
                <span className={cn("rounded-full px-2.5 py-1 font-medium whitespace-nowrap", orderStatusColors[o.status])}>{orderStatusLabel(o.status, "ru", o.printed)}</span>
                {o.claimed ? <span className="rounded-md bg-amber-50 px-2 py-1 font-medium text-amber-800">сообщил об оплате</span> : null}
                {o.desiredLabel ? <span className="rounded-md bg-red-50 px-2 py-1 font-medium text-red-700">к {o.desiredLabel}</span> : null}
                {o.promoCode ? <span className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-700">{o.promoCode}</span> : null}
                <span className="ml-auto text-muted">{o.createdLabel}</span>
              </div>
            </Link>
          </li>
        ))}
        {rows.length === 0 ? <li className="rounded-2xl border border-dashed border-line bg-white px-4 py-10 text-center text-sm text-muted">Ничего не найдено</li> : null}
      </ul>
      <div className="hidden overflow-x-auto rounded-2xl border border-line bg-white lg:block">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-line text-left text-muted">
            <tr>
              <th className="w-10 px-4 py-3">
                <input type="checkbox" className="accent-wine" checked={all} onChange={toggleAll} aria-label="Выбрать все" />
              </th>
              <th className="px-3 py-3 font-medium">№</th>
              <th className="px-3 py-3 font-medium">Дата</th>
              <th className="px-3 py-3 font-medium">Клиент</th>
              <th className="px-3 py-3 font-medium">Тариф</th>
              <th className="px-3 py-3 text-right font-medium">Сумма</th>
              <th className="px-3 py-3 font-medium">Статус</th>
              <th className="px-3 py-3 font-medium">Менеджер</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((o) => (
              <tr key={o.id} className={cn("hover:bg-cream/40", selected.has(o.id) && "bg-wine/5")}>
                <td className="px-4 py-3">
                  <input type="checkbox" className="accent-wine" checked={selected.has(o.id)} onChange={() => toggle(o.id)} aria-label={`Выбрать заказ ${o.number}`} />
                </td>
                <td className="px-3 py-3 font-medium">
                  <Link href={`/admin/orders/${o.id}`} className="hover:text-wine hover:underline">
                    №{o.number}
                  </Link>
                </td>
                <td className="px-3 py-3 whitespace-nowrap text-muted">{o.createdLabel}</td>
                <td className="px-3 py-3">
                  <div>{o.contactName}</div>
                  <div className="text-xs text-muted">{o.contactLine}</div>
                </td>
                <td className="px-3 py-3">
                  {o.planLabel}
                  {o.desiredLabel ? <div className="text-xs font-medium text-wine">к {o.desiredLabel}</div> : null}
                  {o.promoCode ? <div className="text-xs text-emerald-700">{o.promoCode}</div> : null}
                </td>
                <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                  {o.amountLabel}
                  {o.money ? <div className={cn("text-xs", o.money.kind === "debt" ? "font-medium text-red-700" : "text-emerald-700")}>{o.money.label}</div> : null}
                </td>
                <td className="px-3 py-3">
                  <span className={cn("rounded-full px-2.5 py-1 text-xs whitespace-nowrap", orderStatusColors[o.status])}>{orderStatusLabel(o.status, "ru", o.printed)}</span>
                  {o.claimed ? <div className="mt-1 text-xs text-amber-700">сообщил об оплате</div> : null}
                </td>
                <td className="px-3 py-3 text-muted">{o.assignee ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="py-10 text-center text-muted">Ничего не найдено</p> : null}
      </div>
    </div>
  );
}
