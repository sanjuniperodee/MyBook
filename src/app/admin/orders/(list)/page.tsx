import { planName } from "@/i18n/labels";
import Link from "next/link";
import { MobileFilters } from "@/components/admin/MobileFilters";
import { ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import { container } from "@/server/container";
import { ORDER_STATUSES as orderStatuses } from "@/shared/domain/orders";
import { contactView, requireStaff, staffViewer } from "@/server/access";
import { formatPrice, getPlans } from "@/config/site";
import { isPrintedPlan, orderStatusDot, orderStatusLabel } from "@/modules/ordering/ui/status";
import { orderMoney } from "@/modules/ordering/ui/money";
import { staffLabel } from "@/shared/domain/staff";
import type { OrderFilters } from "@/modules/reporting";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/class-names";
import { PageHeader } from "@/components/admin/PageHeader";
import { OrdersViews } from "../OrdersViews";
import { OrdersTable, type OrderRow } from "../OrdersTable";

export const metadata = { title: "Заказы" };
const PAGE = 50;

/**
 * Заказы: статус — вкладками над списком (одно нажатие), остальные фильтры — одной строкой; таблица с выбором и массовой
 * сменой статуса на ноутбуке, карточки на телефоне; внизу — страницы. Вид «Список · Производство» — общий с канбаном.
 */
export default async function AdminOrders({ searchParams }: { searchParams: Promise<OrderFilters & { page?: string }> }) {
  const staff = await requireStaff("orders.view");
  const params = await searchParams;
  const p = Math.max(1, Number(params.page) || 1);
  const [{ list, n, sum }, admins] = await Promise.all([container().reporting.orderList(params, staffViewer(staff), p, PAGE), container().access.queries.allStaff()]);
  const names = new Map(admins.map((a) => [a.id, staffLabel(a)]));
  const rows: OrderRow[] = list.map((o) => {
    const contact = contactView(staff, { phone: o.contactPhone, email: o.contactEmail });
    const money = orderMoney(o);
    return {
      id: o.id,
      number: o.number,
      createdLabel: formatDate(o.createdAt, true),
      contactName: o.contactName,
      contactLine: [contact.phone, contact.email].filter(Boolean).join(" · "),
      planLabel: `${planName(o.plan)}${o.quantity > 1 ? ` × ${o.quantity}` : ""}`,
      printed: isPrintedPlan(o.plan),
      desiredLabel: o.desiredDate ? formatDate(o.desiredDate) : null,
      amountLabel: formatPrice(money.price),
      money: money.debt > 0 ? { kind: "debt", label: `долг ${formatPrice(money.debt)}` } : money.paid > 0 ? { kind: "paid", label: `оплачено ${formatPrice(money.paid)}` } : null,
      status: o.status,
      claimed: o.status === "pending_payment" && !!o.paymentClaimedAt,
      assignee: o.assigneeId ? (names.get(o.assigneeId) ?? null) : null,
      promoCode: o.promoCode,
    };
  });
  const qs = new URLSearchParams(Object.entries(params).filter(([k, v]) => v && k !== "page") as [string, string][]);
  const pageLink = (n: number) => `?${new URLSearchParams({ ...Object.fromEntries(qs), page: String(n) })}`;
  const statusLink = (s: string) => {
    const q = new URLSearchParams(Object.entries(params).filter(([k, v]) => v && k !== "page" && k !== "status") as [string, string][]);
    if (s) q.set("status", s);
    return `/admin/orders${q.size ? `?${q}` : ""}`;
  };
  // Фильтры, кроме статуса (он — вкладками): от них зависит подсветка «Фильтры» на телефоне и «Сбросить».
  const narrowed = [...qs.keys()].some((k) => k !== "status");
  const pages = Math.ceil(n / PAGE);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Заказы"
        actions={
          <>
            <OrdersViews active="list" />
            <a href={`/api/admin/export/orders?${qs}`} className="btn btn-outline btn-sm max-lg:hidden">
              <Download className="size-4" aria-hidden /> Выгрузить CSV
            </a>
          </>
        }
      >
        Найдено {n.toLocaleString("ru-RU")}, получено {formatPrice(sum)} с учётом предоплат.
      </PageHeader>

      <div className="space-y-3">
        {/* Статус — вкладками: на ноутбуке строкой, на телефоне лентой вбок. */}
        <nav aria-label="Статус заказа" className="m-hscroll flex flex-wrap gap-1.5" data-no-ptr>
          {[{ key: "", label: "Все" }, ...orderStatuses.map((s) => ({ key: s, label: orderStatusLabel(s) }))].map((s) => {
            const on = (params.status ?? "") === s.key;
            return (
              <Link key={s.key || "all"} href={statusLink(s.key)} aria-current={on ? "page" : undefined} className={cn("chip max-lg:h-10", on && "chip-on")}>
                {s.key ? <span className={cn("size-1.5 rounded-full", on ? "bg-current" : orderStatusDot[s.key as keyof typeof orderStatusDot])} aria-hidden /> : null}
                {s.label}
              </Link>
            );
          })}
        </nav>

        <MobileFilters active={narrowed}>
          <form className="panel grid gap-2 p-2.5 sm:grid-cols-2 lg:grid-cols-[minmax(14rem,2fr)_repeat(2,minmax(9rem,1fr))_repeat(2,minmax(8.5rem,10rem))_auto]">
            {params.status ? <input type="hidden" name="status" value={params.status} /> : null}
            <div className="relative sm:col-span-2 lg:col-span-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <input name="q" defaultValue={params.q} placeholder="№, имя, телефон, e-mail, город" aria-label="Поиск заказов: номер, имя, телефон, e-mail, город" className="input h-10 pl-9 text-sm" />
            </div>
            <select name="plan" defaultValue={params.plan ?? ""} className="input h-10 text-sm" aria-label="Тариф">
              <option value="">Все тарифы</option>
              {getPlans().map((pl) => (
                <option key={pl.id} value={pl.id}>
                  {planName(pl.id)}
                </option>
              ))}
            </select>
            <select name="assignee" defaultValue={params.assignee ?? ""} className="input h-10 text-sm" aria-label="Менеджер">
              <option value="">Любой менеджер</option>
              <option value="me">Мои</option>
              <option value="none">Без ответственного</option>
              {admins.map((a) => (
                <option key={a.id} value={a.id}>
                  {staffLabel(a)}
                </option>
              ))}
            </select>
            <input type="date" name="from" defaultValue={params.from} className="input h-10 text-sm" title="С даты" aria-label="Заказы с даты" />
            <input type="date" name="to" defaultValue={params.to} className="input h-10 text-sm" title="По дату" aria-label="Заказы по дату" />
            <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
              <button className="btn btn-dark btn-sm h-10 flex-1 lg:flex-none">Найти</button>
              {narrowed ? (
                <Link href={params.status ? `/admin/orders?status=${params.status}` : "/admin/orders"} className="btn btn-ghost btn-sm h-10">
                  Сбросить
                </Link>
              ) : null}
            </div>
          </form>
        </MobileFilters>
      </div>

      <OrdersTable rows={rows} filtered={!!qs.size} />

      {pages > 1 ? (
        <nav aria-label="Страницы" className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-muted tabular-nums">
            {(p - 1) * PAGE + 1}–{Math.min(p * PAGE, n)} из {n.toLocaleString("ru-RU")}
          </span>
          <div className="flex items-center gap-2">
            {p > 1 ? (
              <Link className="btn btn-outline btn-sm" href={pageLink(p - 1)}>
                <ChevronLeft className="size-4" aria-hidden /> Назад
              </Link>
            ) : null}
            <span className="px-1 text-muted tabular-nums">
              {p} из {pages}
            </span>
            {p < pages ? (
              <Link className="btn btn-outline btn-sm" href={pageLink(p + 1)}>
                Дальше <ChevronRight className="size-4" aria-hidden />
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
