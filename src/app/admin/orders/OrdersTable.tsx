"use client";

import { initialsOf } from "@/app/admin/deals/ui";
import { ask } from "@/components/ui/overlays";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, CircleDollarSign, LoaderCircle, Package, X } from "lucide-react";
import { bulkStatusAction } from "../actions";
import { orderStatusLabel, orderStatusLabels, orderStatusTone } from "@/modules/ordering/ui/status";
import { ORDER_STATUSES as orderStatuses, type OrderStatus } from "@/shared/domain/orders";
import { cn } from "@/lib/class-names";
import { useRowSelection } from "@/components/admin/useRowSelection";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";

/** Срок заказа («нужна к дате»): подпись, на сколько он близок и тон — просрочен, горит, в запасе. Закрытому заказу срок не грозит. */
export interface OrderDue {
  label: string;
  text: string | null;
  tone: "danger" | "warning" | "neutral";
}

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
  due: OrderDue | null;
  /** Полная цена книги (с предоплатой по сделке). */
  amountLabel: string;
  /** «оплачено X» или «долг Y»; null — бесплатный заказ без денег. */
  money: { kind: "paid" | "debt"; label: string } | null;
  status: OrderStatus;
  claimed: boolean;
  assignee: string | null;
  promoCode: string | null;
}

export interface OrdersFooter {
  count: number;
  /** Уже отформатированная сумма «получено, с учётом предоплат». */
  received: string;
  from: number;
  to: number;
  page: number;
  pages: number;
  prevHref: string | null;
  nextHref: string | null;
}

/** Итог массовой смены статуса: сколько обновлено и сколько пропущено — по каждой причине отдельно. */
export function bulkStatusText(res: { count: number; skipped: number; reasons?: { reason: string; count: number }[] }) {
  const why = (res.reasons ?? []).map((r) => `${r.count} — ${r.reason}`).join("; ");
  return `Обновлено заказов: ${res.count}${res.skipped ? `; пропущено ${res.skipped}${why ? ` (${why})` : ""}` : ""}`;
}

/** Деньги строки: «долг» — ошибкой, «оплачено» — успехом. */
const MoneyLine = ({ money }: { money: OrderRow["money"] }) =>
  money ? <div className={cn("text-xs", money.kind === "debt" ? "font-medium text-danger" : "text-success")}>{money.label}</div> : null;

/** Статус точкой и подписью; «клиент сообщил об оплате» — отдельной строкой: цвет и текст вместе. */
const StatusCell = ({ o }: { o: OrderRow }) => (
  <div className="flex flex-col items-start gap-0.5">
    <Badge tone={orderStatusTone[o.status]} dot>
      {orderStatusLabel(o.status, "ru", o.printed)}
    </Badge>
    {o.claimed ? (
      <span className="inline-flex items-center gap-1 text-xs text-warning">
        <CircleDollarSign className="size-3" aria-hidden /> сообщил об оплате
      </span>
    ) : null}
  </div>
);

/** Срок: дата и, пока заказ открыт, сколько осталось; просроченный — красным. */
const DueCell = ({ due }: { due: OrderRow["due"] }) =>
  due ? (
    <div className="whitespace-nowrap">
      <div className={cn(due.tone === "danger" && "font-medium text-danger", due.tone === "warning" && "font-medium text-warning")}>{due.label}</div>
      {due.text ? <div className={cn("text-xs", due.tone === "neutral" ? "text-muted" : due.tone === "danger" ? "text-danger" : "text-warning")}>{due.text}</div> : null}
    </div>
  ) : (
    <span className="text-muted">—</span>
  );

/** Ответственный: кружок с инициалами и имя; без ответственного — прочерк. */
const Owner = ({ name }: { name: string | null }) =>
  name ? (
    <span className="inline-flex max-w-40 items-center gap-2">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-sunken text-[10px] font-semibold text-ink-soft uppercase" aria-hidden>
        {initialsOf(name)}
      </span>
      <span className="truncate text-ink-soft">{name}</span>
    </span>
  ) : (
    <span className="text-muted">не назначен</span>
  );

/**
 * Ведомость заказов: на ноутбуке — таблица «№ / клиент / книга / сумма / статус / срок / ответственный», строка открывает
 * заказ целиком (ссылка в № остаётся для клавиатуры), выбор строк включает панель массовой смены статуса; на телефоне —
 * карточки одним листом. Подвал — сколько найдено, сколько получено и страницы.
 */
export function OrdersTable({ rows, filtered = false, footer }: { rows: OrderRow[]; filtered?: boolean; footer: OrdersFooter }) {
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
      <div className="rounded-[var(--r-panel)] border border-line bg-white lg:rounded-none lg:border-0">
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
    <div className="space-y-3 lg:space-y-0">
      {selected.size ? (
        <div
          className="sticky top-[calc(var(--topbar-h)+0.5rem)] z-20 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--r-panel)] bg-ink px-3 py-2.5 text-sm text-white shadow-lift max-lg:bottom-auto sm:px-4 lg:mx-3 lg:my-3"
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
        <Alert kind={message.error ? "error" : "success"} className="items-center lg:mx-3 lg:my-3">
          <span className="flex flex-wrap items-center justify-between gap-2">
            {message.text}
            <button type="button" className="text-xs underline opacity-80 hover:opacity-100" onClick={() => setMessage(null)}>
              Скрыть
            </button>
          </span>
        </Alert>
      ) : null}

      {/* Телефон: карточки одним листом — номер и клиент, сумма, книга и срок, статус и ответственный; нажатие открывает заказ. */}
      <ul className="panel divide-y divide-line overflow-hidden lg:hidden" data-testid="orders-cards">
        {rows.map((o) => (
          <li key={o.id}>
            <Link href={`/admin/orders/${o.id}`} className="m-card relative block px-4 py-3.5">
              {o.due && o.due.tone !== "neutral" ? <span className={cn("absolute inset-y-0 left-0 w-[3px]", o.due.tone === "danger" ? "bg-danger" : "bg-warning")} aria-hidden /> : null}
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
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <StatusCell o={o} />
                {o.due ? (
                  <span className={cn("text-[13px]", o.due.tone === "danger" ? "font-medium text-danger" : o.due.tone === "warning" ? "font-medium text-warning" : "text-muted")}>
                    к {o.due.label}
                    {o.due.text ? `, ${o.due.text}` : ""}
                  </span>
                ) : null}
                {o.promoCode ? <span className="font-mono text-xs text-muted">{o.promoCode}</span> : null}
                <span className="ml-auto text-xs text-muted">{o.assignee ?? o.createdLabel}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto lg:block">
        <table className="table min-w-[940px]">
          <thead>
            <tr>
              <th className="w-10">
                <input type="checkbox" className="size-4 accent-wine" checked={all} onChange={toggleAll} aria-label="Выбрать все" />
              </th>
              <th>№</th>
              <th>Клиент</th>
              <th>Книга</th>
              <th className="num">Сумма</th>
              <th>Статус</th>
              <th>Срок</th>
              <th>Ответственный</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => {
              const on = selected.has(o.id);
              return (
                <tr
                  key={o.id}
                  className={cn("cursor-pointer", on && "[&>td]:bg-rose/50")}
                  aria-selected={on}
                  onClick={(e) => {
                    // Клик по ссылке, флажку или кнопке внутри строки — их собственное действие, а не открытие заказа.
                    if ((e.target as HTMLElement).closest("a,button,input,label,select")) return;
                    router.push(`/admin/orders/${o.id}`);
                  }}
                >
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
                    <div className="truncate font-medium">{o.contactName}</div>
                    {o.contactLine ? <div className="truncate text-xs text-muted">{o.contactLine}</div> : null}
                  </td>
                  <td className="max-w-56">
                    <div className="truncate">
                      {o.planLabel}
                      {o.printed ? null : <span className="text-muted">, электронная</span>}
                    </div>
                    {o.promoCode ? <div className="font-mono text-xs text-muted">{o.promoCode}</div> : null}
                  </td>
                  <td className="num whitespace-nowrap">
                    <div className="font-medium">{o.amountLabel}</div>
                    <MoneyLine money={o.money} />
                  </td>
                  <td>
                    <StatusCell o={o} />
                  </td>
                  <td>
                    <DueCell due={o.due} />
                  </td>
                  <td className="whitespace-nowrap">
                    <Owner name={o.assignee} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <nav aria-label="Страницы" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1 text-sm text-muted lg:border-t lg:border-line lg:px-5 lg:py-2.5">
        <span className="tabular-nums">
          {footer.pages > 1 ? `${footer.from}–${footer.to} из ${footer.count.toLocaleString("ru-RU")}` : `Заказов: ${footer.count.toLocaleString("ru-RU")}`}
          <span className="max-sm:hidden">, получено {footer.received} с учётом предоплат</span>
        </span>
        {footer.pages > 1 ? (
          <div className="flex items-center gap-2">
            {footer.prevHref ? (
              <Link className="btn btn-outline btn-sm" href={footer.prevHref}>
                <ChevronLeft className="size-4" aria-hidden /> Назад
              </Link>
            ) : null}
            <span className="px-1 tabular-nums">
              {footer.page} из {footer.pages}
            </span>
            {footer.nextHref ? (
              <Link className="btn btn-outline btn-sm" href={footer.nextHref}>
                Дальше <ChevronRight className="size-4" aria-hidden />
              </Link>
            ) : null}
          </div>
        ) : null}
      </nav>
    </div>
  );
}
