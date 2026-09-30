import { planName } from "@/i18n/labels";
import Link from "next/link";
import { desc, sql } from "drizzle-orm";
import { Download, Kanban } from "lucide-react";
import { db } from "@/lib/db";
import { orders, orderStatuses } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth";
import { formatPrice, plans } from "@/config/site";
import { orderStatusLabel } from "@/lib/orders-shared";
import { adminLabel, listAdmins } from "@/lib/crm";
import { orderWhere, type OrderFilters } from "@/lib/crm-filters";
import { formatDate } from "@/lib/utils";
import { OrdersTable, type OrderRow } from "./OrdersTable";

export const metadata = { title: "Заказы" };
const PAGE = 50;

export default async function AdminOrders({ searchParams }: { searchParams: Promise<OrderFilters & { page?: string }> }) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const p = Math.max(1, Number(params.page) || 1);
  const where = orderWhere(params, admin.id);
  const [list, [{ n, sum }], admins] = await Promise.all([
    db.select().from(orders).where(where).orderBy(desc(orders.createdAt)).limit(PAGE).offset((p - 1) * PAGE),
    db.select({ n: sql<number>`count(*)::int`, sum: sql<number>`coalesce(sum(${orders.amount}) filter (where ${orders.paidAt} is not null and ${orders.status} <> 'cancelled'),0)::int` }).from(orders).where(where),
    listAdmins(),
  ]);
  const names = new Map(admins.map((a) => [a.id, adminLabel(a)]));
  const rows: OrderRow[] = list.map((o) => ({
    id: o.id,
    number: o.number,
    createdLabel: formatDate(o.createdAt, true),
    contactName: o.contactName,
    contactLine: `${o.contactPhone} · ${o.contactEmail}`,
    planLabel: `${planName(o.plan)}${o.quantity > 1 ? ` × ${o.quantity}` : ""}`,
    desiredLabel: o.desiredDate ? formatDate(o.desiredDate) : null,
    amountLabel: formatPrice(o.amount),
    status: o.status,
    claimed: o.status === "pending_payment" && !!o.paymentClaimedAt,
    assignee: o.assigneeId ? (names.get(o.assigneeId) ?? null) : null,
    promoCode: o.promoCode,
  }));
  const qs = new URLSearchParams(Object.entries(params).filter(([k, v]) => v && k !== "page") as [string, string][]);
  const pageLink = (n: number) => `?${new URLSearchParams({ ...Object.fromEntries(qs), page: String(n) })}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Заказы</h1>
          <p className="text-sm text-muted">
            Найдено {n} · оплачено на {formatPrice(sum)}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/board" className="btn btn-outline btn-sm">
            <Kanban className="size-4" /> Доска
          </Link>
          <a href={`/api/admin/export/orders?${qs}`} className="btn btn-outline btn-sm">
            <Download className="size-4" /> CSV
          </a>
        </div>
      </div>

      <form className="grid gap-2 rounded-2xl border border-line bg-white p-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto]">
        <input name="q" defaultValue={params.q} placeholder="№, имя, телефон, e-mail, город" className="input h-10 text-sm" />
        <select name="status" defaultValue={params.status ?? ""} className="input h-10 text-sm">
          <option value="">Все статусы</option>
          {orderStatuses.map((s) => (
            <option key={s} value={s}>
              {orderStatusLabel(s)}
            </option>
          ))}
        </select>
        <select name="plan" defaultValue={params.plan ?? ""} className="input h-10 text-sm">
          <option value="">Все тарифы</option>
          {plans.map((pl) => (
            <option key={pl.id} value={pl.id}>
              {planName(pl.id)}
            </option>
          ))}
        </select>
        <select name="assignee" defaultValue={params.assignee ?? ""} className="input h-10 text-sm">
          <option value="">Любой менеджер</option>
          <option value="me">Мои</option>
          <option value="none">Без ответственного</option>
          {admins.map((a) => (
            <option key={a.id} value={a.id}>
              {adminLabel(a)}
            </option>
          ))}
        </select>
        <input type="date" name="from" defaultValue={params.from} className="input h-10 text-sm" title="С даты" />
        <input type="date" name="to" defaultValue={params.to} className="input h-10 text-sm" title="По дату" />
        <div className="flex gap-2">
          <button className="btn btn-dark btn-sm h-10">Найти</button>
          {qs.toString() ? (
            <Link href="/admin/orders" className="btn btn-ghost btn-sm h-10">
              Сброс
            </Link>
          ) : null}
        </div>
      </form>

      <OrdersTable rows={rows} />

      {n > PAGE ? (
        <div className="flex items-center justify-center gap-3 text-sm">
          {p > 1 ? <Link className="btn btn-outline btn-sm" href={pageLink(p - 1)}>← Назад</Link> : null}
          <span className="text-muted">
            {p} из {Math.ceil(n / PAGE)}
          </span>
          {p * PAGE < n ? <Link className="btn btn-outline btn-sm" href={pageLink(p + 1)}>Дальше →</Link> : null}
        </div>
      ) : null}
    </div>
  );
}
