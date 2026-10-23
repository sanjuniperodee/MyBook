import { container } from "@/server/container";
import { formatPrice } from "@/config/site";
import { formatDate } from "@/lib/dates";
import { PromoForm, PromoToggle } from "./PromoForm";
import { requireStaff } from "@/server/access";

export default async function AdminPromo() {
  await requireStaff("promo.manage");
  const list = await container().ordering.queries.promoStats();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Промокоды</h1>
      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="mb-4 font-semibold">Новый промокод</h2>
        <PromoForm />
        <p className="mt-3 text-xs text-muted">Скидка применяется к стоимости книг, доставка оплачивается полностью. Заказ со 100% скидкой сразу считается оплаченным.</p>
      </section>
      <ul className="space-y-2.5 lg:hidden" data-testid="promo-cards">
        {list.map(({ promo, revenue, paid }) => (
          <li key={promo.id} className="rounded-2xl border border-line bg-white p-3.5 shadow-soft">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-[16px] font-semibold">{promo.code}</div>
                {promo.note ? <div className="truncate text-sm text-muted">{promo.note}</div> : null}
              </div>
              <div className="text-[15px] font-semibold whitespace-nowrap tabular-nums">{promo.kind === "percent" ? `${promo.value}%` : formatPrice(promo.value)}</div>
            </div>
            <div className="mt-2 text-xs text-muted">
              Использован {promo.usedCount}
              {promo.maxUses ? ` / ${promo.maxUses}` : ""} · оплачено {paid} · {formatPrice(revenue)} · {promo.expiresAt ? `до ${formatDate(promo.expiresAt)}` : "бессрочно"}
            </div>
            <div className="mt-2">
              <PromoToggle id={promo.id} active={promo.active} />
            </div>
          </li>
        ))}
        {list.length === 0 ? <li className="rounded-2xl border border-dashed border-line bg-white px-4 py-10 text-center text-sm text-muted">Промокодов пока нет</li> : null}
      </ul>
      <div className="hidden overflow-x-auto rounded-2xl border border-line bg-white lg:block">
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
