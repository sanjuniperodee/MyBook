"use client";

import { ask } from "@/components/ui/overlays";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LoaderCircle } from "lucide-react";
import { bulkStatusAction } from "../actions";
import { orderStatusColors, orderStatusLabels } from "@/lib/orders-shared";
import { orderStatuses, type OrderStatus } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

export interface OrderRow {
  id: string;
  number: number;
  createdLabel: string;
  contactName: string;
  contactLine: string;
  planLabel: string;
  desiredLabel: string | null;
  amountLabel: string;
  status: OrderStatus;
  claimed: boolean;
  assignee: string | null;
  promoCode: string | null;
}

export function OrdersTable({ rows }: { rows: OrderRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<OrderStatus>("in_production");
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();
  const all = rows.length > 0 && selected.size === rows.length;
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const apply = async () => {
    if (!(await ask(`Перевести ${selected.size} заказ(ов) в статус «${orderStatusLabels[status]}»? Клиенты получат письма.`))) return;
    start(async () => {
      try {
        const res = await bulkStatusAction([...selected], status);
        setMessage(`Обновлено заказов: ${res.count}`);
        setSelected(new Set());
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
          <button className="ml-auto text-white/70 hover:text-white" onClick={() => setSelected(new Set())}>
            Снять выделение
          </button>
        </div>
      ) : null}
      {message ? <p className="text-sm text-muted">{message}</p> : null}
      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-line text-left text-muted">
            <tr>
              <th className="w-10 px-4 py-3">
                <input type="checkbox" className="accent-wine" checked={all} onChange={() => setSelected(all ? new Set() : new Set(rows.map((r) => r.id)))} aria-label="Выбрать все" />
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
                <td className="px-3 py-3 text-right tabular-nums">{o.amountLabel}</td>
                <td className="px-3 py-3">
                  <span className={cn("rounded-full px-2.5 py-1 text-xs whitespace-nowrap", orderStatusColors[o.status])}>{orderStatusLabels[o.status]}</span>
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
