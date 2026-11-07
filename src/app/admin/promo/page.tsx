import { TicketPercent } from "lucide-react";
import { container } from "@/server/container";
import { formatPrice } from "@/config/site";
import { formatDate } from "@/lib/dates";
import { PromoForm, PromoToggle } from "./PromoForm";
import { requireStaff } from "@/server/access";
import { PageHeader } from "@/components/admin/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata = { title: "Промокоды" };

/** Промокоды: форма нового кода сверху, ниже — все коды с использованием, выручкой и переключателем «активен». */
export default async function AdminPromo() {
  await requireStaff("promo.manage");
  const list = await container().ordering.queries.promoStats();
  const discount = (p: { kind: string; value: number }) => (p.kind === "percent" ? `${p.value}%` : formatPrice(p.value));
  const until = (p: { expiresAt: Date | null }) => (p.expiresAt ? `до ${formatDate(p.expiresAt)}` : "бессрочно");
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Промокоды">Скидка действует на книги, доставка оплачивается полностью. Заказ со скидкой 100% сразу считается оплаченным.</PageHeader>

      <Panel title="Новый промокод">
        <PromoForm />
      </Panel>

      {list.length === 0 ? (
        <div className="panel">
          <EmptyState icon={TicketPercent} title="Промокодов пока нет">
            Создайте первый код в форме выше: для блогера, рассылки или постоянного клиента.
          </EmptyState>
        </div>
      ) : (
        <>
          <ul className="panel divide-y divide-line overflow-hidden lg:hidden" data-testid="promo-cards">
            {list.map(({ promo, revenue, paid }) => (
              <li key={promo.id} className="px-4 py-3.5">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-[15px] font-semibold">{promo.code}</div>
                    {promo.note ? <div className="truncate text-sm text-muted">{promo.note}</div> : null}
                  </div>
                  <div className="text-[15px] font-semibold whitespace-nowrap tabular-nums">{discount(promo)}</div>
                </div>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <dt className="text-muted">Использован</dt>
                    <dd className="tabular-nums">
                      {promo.usedCount}
                      {promo.maxUses ? ` из ${promo.maxUses}` : ""}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Оплачено</dt>
                    <dd className="tabular-nums">
                      {paid}, {formatPrice(revenue)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Срок</dt>
                    <dd>{until(promo)}</dd>
                  </div>
                </dl>
                <div className="mt-2">
                  <PromoToggle id={promo.id} active={promo.active} code={promo.code} />
                </div>
              </li>
            ))}
          </ul>
          <Panel flush className="hidden overflow-x-auto lg:block" title={<>Все промокоды <span className="font-normal text-muted tabular-nums">{list.length}</span></>}>
            <table className="table min-w-[760px] [&_td:first-child]:pl-5 [&_td:last-child]:pr-5 [&_th:first-child]:pl-5 [&_th:last-child]:pr-5">
              <thead>
                <tr>
                  <th>Код</th>
                  <th className="text-right">Скидка</th>
                  <th>Использован</th>
                  <th className="text-right">Оплачено заказов</th>
                  <th>Действует</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {list.map(({ promo, revenue, paid }) => (
                  <tr key={promo.id}>
                    <td className="max-w-72">
                      <div className="font-mono font-medium">{promo.code}</div>
                      {promo.note ? <div className="truncate text-xs text-muted">{promo.note}</div> : null}
                    </td>
                    <td className="text-right font-medium tabular-nums">{discount(promo)}</td>
                    <td className="tabular-nums">
                      {promo.usedCount}
                      {promo.maxUses ? <span className="text-muted"> из {promo.maxUses}</span> : null}
                      {promo.maxUses ? (
                        <div className="mt-1 h-1 w-20 overflow-hidden rounded-full bg-sunken" aria-hidden>
                          <div className="h-full rounded-full bg-wine" style={{ width: `${Math.min(100, (promo.usedCount / promo.maxUses) * 100)}%` }} />
                        </div>
                      ) : null}
                    </td>
                    <td className="text-right tabular-nums">
                      {paid}
                      <div className="text-xs text-muted">{formatPrice(revenue)}</div>
                    </td>
                    <td className="whitespace-nowrap text-muted">{until(promo)}</td>
                    <td>
                      <PromoToggle id={promo.id} active={promo.active} code={promo.code} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </>
      )}
    </div>
  );
}
