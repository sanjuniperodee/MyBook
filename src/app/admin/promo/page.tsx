import { Plus, TicketPercent } from "lucide-react";
import { container } from "@/server/container";
import { formatPrice } from "@/config/site";
import { formatDate } from "@/lib/dates";
import { PromoForm, PromoToggle } from "./PromoForm";
import { requireStaff } from "@/server/access";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { DrawerButton } from "@/components/admin/Drawer";
import { InlineStats, ShareBar } from "@/components/admin/bars";

export const metadata = { title: "Промокоды" };

/**
 * Промокоды — «Ведомость»: сверху итоги по кодам одной строкой, ниже все коды с использованием (полоса — доля лимита),
 * оплаченными заказами и выручкой; статус — точка и подпись, нажатие включает или выключает код. Новый код — в боковой
 * панели (на телефоне — шторка), чтобы форма не заслоняла список.
 */
export default async function AdminPromo() {
  await requireStaff("promo.manage");
  const list = await container().ordering.queries.promoStats();
  const discount = (p: { kind: string; value: number }) => (p.kind === "percent" ? `${p.value}%` : formatPrice(p.value));
  const until = (p: { expiresAt: Date | null }) => (p.expiresAt ? `до ${formatDate(p.expiresAt)}` : "бессрочно");
  const active = list.filter((x) => x.promo.active).length;
  const used = list.reduce((a, x) => a + x.promo.usedCount, 0);
  const paid = list.reduce((a, x) => a + x.paid, 0);
  const revenue = list.reduce((a, x) => a + x.revenue, 0);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Промокоды"
        actions={
          <DrawerButton variant="primary" label="Создать промокод" icon={<Plus className="size-4" aria-hidden />} title="Новый промокод" description="Скидка действует на книги, доставка оплачивается полностью" testId="new-promo">
            <PromoForm />
          </DrawerButton>
        }
      >
        Скидка действует на книги, доставка оплачивается полностью. Заказ со скидкой 100% сразу считается оплаченным.
      </PageHeader>

      {list.length === 0 ? (
        <div className="panel">
          <EmptyState icon={TicketPercent} title="Промокодов пока нет">
            Нажмите «Создать промокод» вверху: код для блогера, рассылки или постоянного клиента.
          </EmptyState>
        </div>
      ) : (
        <>
          <InlineStats
            items={[
              { label: "Всего кодов", value: list.length, hint: `активных ${active}` },
              { label: "Использований", value: used },
              { label: "Оплачено заказов", value: paid },
              { label: "Выручка с кодами", value: formatPrice(revenue) },
            ]}
          />
          <ul className="panel divide-y divide-line overflow-hidden lg:hidden" data-testid="promo-cards">
            {list.map(({ promo, revenue: rev, paid: pd }) => (
              <li key={promo.id} className="px-4 py-3.5">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-[15px] font-semibold">{promo.code}</div>
                    {promo.note ? <div className="truncate text-sm text-muted">{promo.note}</div> : null}
                  </div>
                  <div className="text-[15px] font-semibold whitespace-nowrap tabular-nums">{discount(promo)}</div>
                </div>
                {promo.maxUses ? <ShareBar value={promo.usedCount} max={promo.maxUses} className="mt-2" /> : null}
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
                      {pd}, {formatPrice(rev)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Срок</dt>
                    <dd>{until(promo)}</dd>
                  </div>
                </dl>
                <div className="mt-1 -ml-2">
                  <PromoToggle id={promo.id} active={promo.active} code={promo.code} />
                </div>
              </li>
            ))}
          </ul>
          <div className="panel hidden overflow-hidden lg:block">
            <div className="overflow-x-auto">
              <table className="table min-w-[760px]">
                <thead>
                  <tr>
                    <th>Код</th>
                    <th className="num">Скидка</th>
                    <th className="w-56">Использован</th>
                    <th className="num">Оплачено заказов</th>
                    <th>Действует</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map(({ promo, revenue: rev, paid: pd }) => (
                    <tr key={promo.id}>
                      <td className="max-w-72">
                        <div className="font-mono font-medium">{promo.code}</div>
                        {promo.note ? <div className="truncate text-xs text-muted">{promo.note}</div> : null}
                      </td>
                      <td className="num font-medium">{discount(promo)}</td>
                      <td>
                        <div className="flex items-center gap-3">
                          <span className="shrink-0 tabular-nums">
                            {promo.usedCount}
                            {promo.maxUses ? <span className="text-muted"> из {promo.maxUses}</span> : null}
                          </span>
                          {promo.maxUses ? <ShareBar value={promo.usedCount} max={promo.maxUses} className="h-1.5 flex-1" /> : null}
                        </div>
                      </td>
                      <td className="num">
                        {pd}
                        <div className="text-xs text-muted">{formatPrice(rev)}</div>
                      </td>
                      <td className="whitespace-nowrap text-muted">{until(promo)}</td>
                      <td>
                        <PromoToggle id={promo.id} active={promo.active} code={promo.code} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-line px-4 py-2.5 text-xs text-muted sm:px-5">
              Всего кодов: {list.length}, активных: {active}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
