import Link from "next/link";
import { and, desc, gte, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { books, orders, users } from "@/lib/db/schema";
import { formatPrice, getPlan } from "@/config/site";
import { orderStatusColors, orderStatusLabel } from "@/lib/orders-shared";
import { cn, formatDate } from "@/lib/utils";

export default async function AdminDashboard() {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const [[usersCount], [booksCount], [revenue], byStatus, attention, recent] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(users),
    db.select({ n: sql<number>`count(*)::int` }).from(books),
    db
      .select({ sum: sql<number>`coalesce(sum(${orders.amount}),0)::int`, n: sql<number>`count(*)::int` })
      .from(orders)
      .where(and(isNotNull(orders.paidAt), gte(orders.paidAt, monthStart), ne(orders.status, "cancelled"))),
    db.select({ status: orders.status, n: sql<number>`count(*)::int` }).from(orders).groupBy(orders.status),
    db.query.orders.findMany({
      where: sql`(${orders.status} = 'pending_payment' and ${orders.paymentClaimedAt} is not null) or ${orders.status} = 'paid'`,
      orderBy: desc(orders.createdAt),
      limit: 20,
    }),
    db.query.orders.findMany({ orderBy: desc(orders.createdAt), limit: 10 }),
  ]);
  const count = (s: string) => byStatus.find((b) => b.status === s)?.n ?? 0;
  const tiles = [
    { label: "Выручка за месяц", value: formatPrice(revenue.sum), sub: `${revenue.n} оплаченных заказов` },
    { label: "Ждут печати", value: count("paid"), sub: `${count("in_production")} в производстве` },
    { label: "Ожидают оплаты", value: count("pending_payment"), sub: `${count("shipped")} в пути` },
    { label: "Клиенты / книги", value: `${usersCount.n} / ${booksCount.n}`, sub: "всего на сайте" },
  ];
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Обзор</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl border border-line bg-white p-5">
            <div className="text-sm text-muted">{t.label}</div>
            <div className="mt-2 text-3xl font-semibold tabular-nums">{t.value}</div>
            <div className="mt-1 text-xs text-muted">{t.sub}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <OrdersList title="Требуют внимания" empty="Всё обработано 🎉" list={attention} />
        <OrdersList title="Последние заказы" empty="Заказов ещё нет" list={recent} />
      </div>
    </div>
  );
}

function OrdersList({ title, list, empty }: { title: string; empty: string; list: (typeof orders.$inferSelect)[] }) {
  return (
    <section className="rounded-2xl border border-line bg-white">
      <h2 className="border-b border-line px-5 py-4 font-semibold">{title}</h2>
      {list.length === 0 ? <p className="px-5 py-8 text-center text-sm text-muted">{empty}</p> : null}
      <ul className="divide-y divide-line">
        {list.map((o) => (
          <li key={o.id}>
            <Link href={`/admin/orders/${o.id}`} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-cream/40">
              <span className="w-14 font-medium">№{o.number}</span>
              <span className="min-w-0 flex-1 truncate">
                {o.contactName} · {getPlan(o.plan)?.name}
                {o.paymentClaimedAt && o.status === "pending_payment" ? <span className="ml-2 text-amber-700">сообщил об оплате</span> : null}
              </span>
              <span className={cn("rounded-full px-2 py-0.5 text-xs", orderStatusColors[o.status])}>{orderStatusLabel(o.status)}</span>
              <span className="hidden w-24 text-right text-muted sm:block">{formatDate(o.createdAt)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
