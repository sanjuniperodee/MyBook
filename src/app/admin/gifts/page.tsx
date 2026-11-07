import { planName } from "@/i18n/labels";
import Link from "next/link";
import { ExternalLink, Gift } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatRow, StatTile } from "@/components/admin/charts";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { container } from "@/server/container";
import { formatPrice } from "@/config/site";
import { formatDate } from "@/lib/dates";
import { parseDay } from "@/lib/occasions";
import { messagesFor } from "@/i18n/messages";

import { GiftActions } from "./GiftActions";
import { requireStaff } from "@/server/access";

const ru = messagesFor("ru").common;

const statusLabel = { pending_payment: "Ждёт оплаты", paid: "Оплачен", cancelled: "Отменён" } as const;
const statusTone = { pending_payment: "warning", paid: "success", cancelled: "neutral" } as const;

export const metadata = { title: "Сертификаты" };

/**
 * Подарочные сертификаты: показатели одной строкой, затем — те, что ждут подтверждения оплаты (сообщили об оплате — первыми),
 * и вся таблица. Подтверждение оплаты — только с чеком.
 */
export default async function AdminGifts() {
  await requireStaff("gifts.manage");
  const list = await container().ordering.queries.recentGifts();
  const paid = list.filter((g) => g.status === "paid");
  const redeemed = paid.filter((g) => g.promo && g.promo.usedCount > 0);
  const revenue = paid.reduce((s, g) => s + g.amount, 0);
  const waiting = list.filter((g) => g.status === "pending_payment");
  const claimed = waiting.filter((g) => g.paymentClaimedAt).length;
  const delivery = (g: (typeof list)[number]) =>
    g.recipientEmail ? (g.sentAt ? "письмо отправлено" : g.sendAt ? `отправка ${ru.date(parseDay(g.sendAt))}` : "ждёт отправки") : "вручит сам(а)";
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Подарочные сертификаты"
        actions={
          <Link href="/gift" target="_blank" className="btn btn-outline btn-sm">
            <ExternalLink className="size-4" aria-hidden /> Страница покупки
          </Link>
        }
      >
        Сертификат — промокод на книгу. Перевод подтверждайте только с чеком: код уйдёт покупателю и получателю.
      </PageHeader>

      <StatRow>
        <StatTile bare label="Продано" value={String(paid.length)} />
        <StatTile bare label="Выручка" value={formatPrice(revenue)} />
        <StatTile bare label="Использовано" value={`${redeemed.length} из ${paid.length}`} />
        <StatTile bare label="Ждут оплаты" value={String(waiting.length)} hint={claimed ? `сообщили об оплате: ${claimed}` : undefined} />
      </StatRow>

      {list.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={Gift}
            title="Сертификатов пока нет"
            action={
              <Link href="/gift" target="_blank" className="btn btn-outline btn-sm">
                Открыть страницу покупки
              </Link>
            }
          >
            Покупки со страницы «Подарить книгу» появятся здесь вместе с кодом и статусом отправки.
          </EmptyState>
        </div>
      ) : (
        <>
          <ul className="panel divide-y divide-line overflow-hidden lg:hidden" data-testid="gifts-cards">
            {list.map((g) => (
              <li key={g.id} className="px-4 py-3.5">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-semibold">
                      <span className="tabular-nums">№{g.number}</span> <span className="font-medium">{g.buyerName}</span>
                    </div>
                    <div className="truncate text-sm text-muted">{[g.buyerEmail, g.buyerPhone].filter(Boolean).join(", ")}</div>
                    <div className="truncate text-sm text-ink-soft">
                      Для {g.recipientName}, <span className="text-muted">{delivery(g)}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[15px] font-semibold whitespace-nowrap tabular-nums">{formatPrice(g.amount)}</div>
                    <div className="text-xs text-muted">{planName(g.plan)}</div>
                  </div>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <GiftStatus g={g} />
                  {g.promo ? <Badge className="font-mono">{g.promo.code}</Badge> : null}
                  <span className="ml-auto text-xs text-muted">{formatDate(g.createdAt)}</span>
                </div>
                <div className="mt-2.5">
                  <GiftActions id={g.id} status={g.status} canResend={!!g.recipientEmail} receipt={g.receiptStorageKey ? `/api/admin/gifts/${g.id}/receipt` : null} />
                </div>
              </li>
            ))}
          </ul>
          <div className="panel hidden overflow-x-auto lg:block">
            <table className="table min-w-[960px] [&_td:first-child]:pl-5 [&_td:last-child]:pr-5 [&_th:first-child]:pl-5 [&_th:last-child]:pr-5">
              <thead>
                <tr>
                  <th>№</th>
                  <th>Покупатель</th>
                  <th>Получатель</th>
                  <th>Книга</th>
                  <th>Код</th>
                  <th>Статус</th>
                  <th>
                    <span className="sr-only">Действия</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.map((g) => (
                  <tr key={g.id}>
                    <td className="whitespace-nowrap">
                      <div className="font-semibold tabular-nums">№{g.number}</div>
                      <div className="text-xs text-muted">{formatDate(g.createdAt)}</div>
                    </td>
                    <td className="max-w-56">
                      <div className="truncate">{g.buyerName}</div>
                      <div className="truncate text-xs text-muted">{[g.buyerEmail, g.buyerPhone].filter(Boolean).join(", ")}</div>
                    </td>
                    <td className="max-w-56">
                      <div className="truncate">{g.recipientName}</div>
                      <div className="truncate text-xs text-muted">{g.recipientEmail ? `${g.recipientEmail}, ${delivery(g)}` : delivery(g)}</div>
                    </td>
                    <td className="whitespace-nowrap">
                      {planName(g.plan)}
                      <div className="text-xs text-muted tabular-nums">{formatPrice(g.amount)}</div>
                    </td>
                    <td>
                      {g.promo ? <span className="font-mono text-[13px]">{g.promo.code}</span> : <span className="text-muted">—</span>}
                      {g.promo && g.promo.usedCount > 0 ? <div className="text-xs text-success">использован</div> : null}
                    </td>
                    <td>
                      <div className="flex flex-col items-start gap-1">
                        <GiftStatus g={g} />
                      </div>
                    </td>
                    <td>
                      <GiftActions id={g.id} status={g.status} canResend={!!g.recipientEmail} receipt={g.receiptStorageKey ? `/api/admin/gifts/${g.id}/receipt` : null} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function GiftStatus({ g }: { g: { status: keyof typeof statusLabel; paymentClaimedAt: Date | null; promo: { usedCount: number } | null } }) {
  return (
    <>
      <Badge tone={statusTone[g.status]} dot>
        {statusLabel[g.status]}
      </Badge>
      {g.status === "pending_payment" && g.paymentClaimedAt ? <Badge tone="warning">сообщил об оплате</Badge> : null}
      {g.status === "paid" && g.promo && g.promo.usedCount > 0 ? <Badge tone="info">код использован</Badge> : null}
    </>
  );
}
