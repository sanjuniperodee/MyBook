"use client";

import { ask } from "@/components/ui/overlays";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarClock, CircleDollarSign, LoaderCircle, Package, X } from "lucide-react";
import { bulkStatusAction } from "../actions";
import { orderStatusLabel, orderStatusLabels, orderStatusTone } from "@/modules/ordering/ui/status";
import { ORDER_STATUSES as orderStatuses, type OrderStatus } from "@/shared/domain/orders";
import { cn } from "@/lib/class-names";
import { useRowSelection } from "@/components/admin/useRowSelection";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";

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

/** Итог массовой смены статуса: сколько обновлено и сколько пропущено — по каждой причине отдельно. */
export function bulkStatusText(res: { count: number; skipped: number; reasons?: { reason: string; count: number }[] }) {
  const why = (res.reasons ?? []).map((r) => `${r.count} — ${r.reason}`).join("; ");
  return `Обновлено заказов: ${res.count}${res.skipped ? `; пропущено ${res.skipped}${why ? ` (${why})` : ""}` : ""}`;
}

/** Деньги строки: «долг» — ошибкой, «оплачено» — успехом. */
const MoneyLine = ({ money }: { money: OrderRow["money"] }) =>
  money ? <div className={cn("text-xs", money.kind === "debt" ? "font-medium text-danger" : "text-success")}>{money.label}</div> : null;

/** Статус и «клиент сообщил об оплате» — значками: цвет и текст вместе. */
const StatusBadges = ({ o }: { o: OrderRow }) => (
  <>
    <Badge tone={orderStatusTone[o.status]} dot>
      {orderStatusLabel(o.status, "ru", o.printed)}
    </Badge>
    {o.claimed ? (
      <Badge tone="warning">
        <CircleDollarSign className="size-3" aria-hidden /> сообщил об оплате
      </Badge>
    ) : null}
  </>
);

/**
 * Список заказов: таблица с выбором и массовой сменой статуса на ноутбуке, карточки одним листом на телефоне. Панель
 * массовых действий прилипает под шапкой (var(--topbar-h)) и говорит, сколько обновлено и почему что-то пропущено.
 */
export function OrdersTable({ rows, filtered = false }: { rows: OrderRow[]; filtered?: boolean }) {
  const { selected, all, ids, toggle, toggleAll, clear } = useRowSelection(rows);
  const [status, setStatus] = useState<OrderStatus>("in_production");
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const router = useRouter();

  const apply = async () => {
    if (!(await ask(`Перевести ${selected.size} заказ(ов) в статус «${orderStatusLabels[status]}»? Клиенты получат письма.`))) return;
    start(async () => {
      try {
        const res = await bulkStatusAction(ids(), status);
        setMessage({ text: bulkStatusText(res), error: false });
        clear();
        router.refresh();
      } catch (e) {
        setMessage({ text: (e as Error).message, error: true });
      }
    });
  };

  if (!rows.length)
    return (
      <div className="panel">
        <EmptyState
          icon={Package}
          title={filtered ? "По этим фильтрам заказов нет" : "Заказов пока нет"}
          action={
            filtered ? (
              <Link href="/admin/orders" className="btn btn-outline btn-sm">
                Сбросить фильтры
              </Link>
            ) : null
          }
        >
          {filtered ? "Измените статус, даты или строку поиска." : "Заказы клиентов с сайта и оформленные менеджерами появятся здесь."}
        </EmptyState>
      </div>
    );

  return (
    <div className="space-y-3">
      {selected.size ? (
        <div
          className="sticky top-[calc(var(--topbar-h)+0.5rem)] z-20 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[14px] bg-ink px-3 py-2.5 text-sm text-white shadow-lift sm:px-4"
          data-testid="orders-bulk-bar"
          role="region"
          aria-label="Действия с выбранными заказами"
        >
          <span className="font-medium tabular-nums">Выбрано: {selected.size}</span>
          <label className="flex items-center gap-2">
            <span className="opacity-80 max-sm:sr-only">Новый статус</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as OrderStatus)}
              className="h-9 rounded-lg border border-white/25 bg-white/10 px-2.5 text-white outline-none focus-visible:border-white/60"
              aria-label="Новый статус"
            >
              {orderStatuses.map((s) => (
                <option key={s} value={s} className="text-ink">
                  {orderStatusLabels[s]}
                </option>
              ))}
            </select>
          </label>
          {/* Кнопки на тёмной плашке — «бумагой» (bg-white в тёмной теме тёмный, плашка — светлая: контраст сохраняется). */}
          <button className="btn btn-sm bg-white text-ink hover:bg-sunken" onClick={apply} disabled={pending}>
            {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null} Применить
          </button>
          <button className="btn btn-sm ml-auto bg-white text-ink hover:bg-sunken" onClick={clear}>
            <X className="size-4" aria-hidden /> Снять выделение
          </button>
        </div>
      ) : null}
      {message ? (
        <Alert kind={message.error ? "error" : "success"} className="items-center">
          <span className="flex flex-wrap items-center justify-between gap-2">
            {message.text}
            <button type="button" className="text-xs underline opacity-80 hover:opacity-100" onClick={() => setMessage(null)}>
              Скрыть
            </button>
          </span>
        </Alert>
      ) : null}

      {/* Телефон: карточки одним листом — номер и клиент, сумма, статус и срок; нажатие открывает заказ. */}
      <ul className="panel divide-y divide-line overflow-hidden lg:hidden" data-testid="orders-cards">
        {rows.map((o) => (
          <li key={o.id}>
            <Link href={`/admin/orders/${o.id}`} className="m-card block px-4 py-3.5">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-semibold">
                    <span className="tabular-nums">№{o.number}</span> <span className="font-medium">{o.contactName}</span>
                  </div>
                  <div className="truncate text-sm text-muted">
                    {o.planLabel}
                    {o.printed ? "" : ", электронная"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[15px] font-semibold whitespace-nowrap tabular-nums">{o.amountLabel}</div>
                  <MoneyLine money={o.money} />
                </div>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <StatusBadges o={o} />
                {o.desiredLabel ? (
                  <Badge tone="accent">
                    <CalendarClock className="size-3" aria-hidden /> к {o.desiredLabel}
                  </Badge>
                ) : null}
                {o.promoCode ? <Badge className="font-mono">{o.promoCode}</Badge> : null}
                <span className="ml-auto text-xs text-muted">{o.createdLabel}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <div className="panel hidden overflow-x-auto lg:block">
        <table className="table min-w-[900px] [&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4">
          <thead>
            <tr>
              <th className="w-10">
                <input type="checkbox" className="size-4 accent-wine" checked={all} onChange={toggleAll} aria-label="Выбрать все" />
              </th>
              <th>Заказ</th>
              <th>Клиент</th>
              <th>Книга</th>
              <th className="text-right">Сумма</th>
              <th>Статус</th>
              <th>Менеджер</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => {
              const on = selected.has(o.id);
              return (
                <tr key={o.id} className={cn(on && "[&>td]:bg-rose/50")} aria-selected={on}>
                  <td>
                    <input type="checkbox" className="size-4 accent-wine" checked={on} onChange={() => toggle(o.id)} aria-label={`Выбрать заказ ${o.number}`} />
                  </td>
                  <td className="whitespace-nowrap">
                    <Link href={`/admin/orders/${o.id}`} className="font-semibold tabular-nums hover:text-wine hover:underline">
                      №{o.number}
                    </Link>
                    <div className="text-xs text-muted">{o.createdLabel}</div>
                  </td>
                  <td className="max-w-64">
                    <Link href={`/admin/orders/${o.id}`} className="block truncate font-medium hover:text-wine">
                      {o.contactName}
                    </Link>
                    {o.contactLine ? <div className="truncate text-xs text-muted">{o.contactLine}</div> : null}
                  </td>
                  <td>
                    <div>
                      {o.planLabel}
                      {o.printed ? null : <span className="text-muted">, электронная</span>}
                    </div>
                    {o.desiredLabel || o.promoCode ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {o.desiredLabel ? (
                          <Badge tone="accent">
                            <CalendarClock className="size-3" aria-hidden /> к {o.desiredLabel}
                          </Badge>
                        ) : null}
                        {o.promoCode ? <Badge className="font-mono">{o.promoCode}</Badge> : null}
                      </div>
                    ) : null}
                  </td>
                  <td className="text-right whitespace-nowrap tabular-nums">
                    <div className="font-medium">{o.amountLabel}</div>
                    <MoneyLine money={o.money} />
                  </td>
                  <td>
                    <div className="flex flex-col items-start gap-1">
                      <StatusBadges o={o} />
                    </div>
                  </td>
                  <td className={cn("whitespace-nowrap", o.assignee ? "text-ink-soft" : "text-muted")}>{o.assignee ?? "Не назначен"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
