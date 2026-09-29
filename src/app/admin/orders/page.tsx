import Link from "next/link";
import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders, orderStatuses } from "@/lib/db/schema";
import { formatPrice, getPlan } from "@/config/site";
import { orderStatusColors, orderStatusLabel } from "@/lib/orders-shared";
import { cn, formatDate } from "@/lib/utils";

const PAGE = 50;

export default async function AdminOrders({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; page?: string }> }) {
  const { status, q, page } = await searchParams;
  const p = Math.max(1, Number(page) || 1);
  const filters: SQL[] = [];
  if (status && (orderStatuses as readonly string[]).includes(status)) filters.push(eq(orders.status, status as never));
  if (q?.trim()) {
    const s = `%${q.trim()}%`;
    const num = Number(q.replace(/\D/g, ""));
    filters.push(or(ilike(orders.contactName, s), ilike(orders.contactEmail, s), ilike(orders.contactPhone, s), ...(num ? [eq(orders.number, num)] : []))!);
  }
  const where = filters.length ? and(...filters) : undefined;
  const [list, [{ n }]] = await Promise.all([
    db.select().from(orders).where(where).orderBy(desc(orders.createdAt)).limit(PAGE).offset((p - 1) * PAGE),
    db.select({ n: sql<number>`count(*)::int` }).from(orders).where(where),
  ]);
  const qs = (patch: Record<string, string | undefined>) => {
    const u = new URLSearchParams({ ...(status ? { status } : {}), ...(q ? { q } : {}), ...patch } as Record<string, string>);
    for (const [k, v] of [...u]) if (!v) u.delete(k);
    return `?${u}`;
  };
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Заказы <span className="text-muted">({n})</span></h1>
        <form className="flex gap-2">
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <input name="q" defaultValue={q} placeholder="№, имя, e-mail, телефон" className="input h-10 w-64" />
          <button className="btn btn-dark btn-sm h-10">Найти</button>
        </form>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Link href={qs({ status: undefined, page: undefined })} className={cn("rounded-full px-3 py-1.5 text-sm", !status ? "bg-ink text-white" : "bg-white")}>Все</Link>
        {orderStatuses.map((s) => (
          <Link key={s} href={qs({ status: s, page: undefined })} className={cn("rounded-full px-3 py-1.5 text-sm", status === s ? "bg-ink text-white" : "bg-white")}>
            {orderStatusLabel(s)}
          </Link>
        ))}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full min-w-[800px] text-sm">
          <thead className="border-b border-line text-left text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">№</th>
              <th className="px-4 py-3 font-medium">Дата</th>
              <th className="px-4 py-3 font-medium">Клиент</th>
              <th className="px-4 py-3 font-medium">Тариф</th>
              <th className="px-4 py-3 font-medium">Сумма</th>
              <th className="px-4 py-3 font-medium">Статус</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {list.map((o) => (
              <tr key={o.id} className="hover:bg-cream/40">
                <td className="px-4 py-3 font-medium"><Link href={`/admin/orders/${o.id}`} className="hover:underline">№{o.number}</Link></td>
                <td className="px-4 py-3 text-muted">{formatDate(o.createdAt, true)}</td>
                <td className="px-4 py-3">
                  <div>{o.contactName}</div>
                  <div className="text-xs text-muted">{o.contactPhone} · {o.contactEmail}</div>
                </td>
                <td className="px-4 py-3">{getPlan(o.plan)?.name}{o.quantity > 1 ? ` × ${o.quantity}` : ""}</td>
                <td className="px-4 py-3 tabular-nums">{formatPrice(o.amount)}</td>
                <td className="px-4 py-3">
                  <span className={cn("rounded-full px-2.5 py-1 text-xs", orderStatusColors[o.status])}>{orderStatusLabel(o.status)}</span>
                  {o.paymentClaimedAt && o.status === "pending_payment" ? <div className="mt-1 text-xs text-amber-700">сообщил об оплате</div> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 ? <p className="py-10 text-center text-muted">Ничего не найдено</p> : null}
      </div>
      {n > PAGE ? (
        <div className="flex justify-center gap-2">
          {p > 1 ? <Link className="btn btn-outline btn-sm" href={qs({ page: String(p - 1) })}>← Назад</Link> : null}
          {p * PAGE < n ? <Link className="btn btn-outline btn-sm" href={qs({ page: String(p + 1) })}>Дальше →</Link> : null}
        </div>
      ) : null}
    </div>
  );
}
