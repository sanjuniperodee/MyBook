import { desc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders, promoCodes } from "@/lib/db/schema";
import { formatPrice } from "@/config/site";
import { formatDate } from "@/lib/utils";
import { PromoForm, PromoToggle } from "./PromoForm";

export default async function AdminPromo() {
  const list = await db
    .select({
      promo: promoCodes,
      revenue: sql<number>`coalesce((select sum(${orders.amount}) from ${orders} where ${orders.promoCode} = ${promoCodes.code} and ${orders.paidAt} is not null), 0)::int`,
      paid: sql<number>`(select count(*)::int from ${orders} where ${orders.promoCode} = ${promoCodes.code} and ${orders.paidAt} is not null)`,
    })
    .from(promoCodes)
    .orderBy(desc(promoCodes.createdAt));
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Промокоды</h1>
      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="mb-4 font-semibold">Новый промокод</h2>
        <PromoForm />
        <p className="mt-3 text-xs text-muted">Скидка применяется к стоимости книг, доставка оплачивается полностью. Заказ со 100% скидкой сразу считается оплаченным.</p>
      </section>
      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-line text-left text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Код</th>
              <th className="px-4 py-3 font-medium">Скидка</th>
              <th className="px-4 py-3 font-medium">Использован</th>
              <th className="px-4 py-3 font-medium">Оплачено заказов</th>
              <th className="px-4 py-3 font-medium">Действует до</th>
              <th className="px-4 py-3 font-medium">Статус</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {list.map(({ promo, revenue, paid }) => (
              <tr key={promo.id}>
                <td className="px-4 py-3">
                  <div className="font-mono font-medium">{promo.code}</div>
                  {promo.note ? <div className="text-xs text-muted">{promo.note}</div> : null}
                </td>
                <td className="px-4 py-3">{promo.kind === "percent" ? `${promo.value}%` : formatPrice(promo.value)}</td>
                <td className="px-4 py-3 tabular-nums">
                  {promo.usedCount}
                  {promo.maxUses ? ` / ${promo.maxUses}` : ""}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {paid} · {formatPrice(revenue)}
                </td>
                <td className="px-4 py-3 text-muted">{promo.expiresAt ? formatDate(promo.expiresAt) : "бессрочно"}</td>
                <td className="px-4 py-3">
                  <PromoToggle id={promo.id} active={promo.active} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 ? <p className="py-10 text-center text-muted">Промокодов пока нет</p> : null}
      </div>
    </div>
  );
}
