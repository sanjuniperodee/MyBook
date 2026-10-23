import { planName } from "@/i18n/labels";
import Link from "next/link";
import { container } from "@/server/container";
import { formatPrice } from "@/config/site";
import { cn } from "@/lib/class-names";
import { formatDate } from "@/lib/dates";
import { parseDay } from "@/lib/occasions";
import { messagesFor } from "@/i18n/messages";

import { GiftActions } from "./GiftActions";
import { requireStaff } from "@/server/access";

const ru = messagesFor("ru").common;

const statusLabel = { pending_payment: "Ждёт оплаты", paid: "Оплачен", cancelled: "Отменён" } as const;

export default async function AdminGifts() {
  await requireStaff("gifts.manage");
  const list = await container().ordering.queries.recentGifts();
  const paid = list.filter((g) => g.status === "paid");
  const redeemed = paid.filter((g) => g.promo && g.promo.usedCount > 0);
  const revenue = paid.reduce((s, g) => s + g.amount, 0);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold">Подарочные сертификаты</h1>
        <Link href="/gift" target="_blank" className="text-sm text-muted underline">Страница покупки</Link>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Продано", String(paid.length)],
          ["Выручка", formatPrice(revenue)],
          ["Использовано", `${redeemed.length} из ${paid.length}`],
          ["Ждут оплаты", String(list.filter((g) => g.status === "pending_payment").length)],
        ].map(([l, v]) => (
          <div key={l} className="rounded-2xl border border-line bg-white p-4">
            <div className="text-xs text-muted">{l}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{v}</div>
          </div>
        ))}
      </div>
      <ul className="space-y-2.5 lg:hidden" data-testid="gifts-cards">
        {list.map((g) => (
          <li key={g.id} className="rounded-2xl border border-line bg-white p-3.5 shadow-soft">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[16px] font-semibold">
                  №{g.number} · {g.buyerName}
                </div>
                <div className="truncate text-sm text-muted">
                  {g.buyerEmail}
                  {g.buyerPhone ? ` · ${g.buyerPhone}` : ""}
                </div>
                <div className="truncate text-xs text-muted">
                  Для: {g.recipientName}
                  {" — "}
                  {g.recipientEmail ? (g.sentAt ? "отправлено" : g.sendAt ? `отправка ${ru.date(parseDay(g.sendAt))}` : "ждёт отправки") : "вручит сам(а)"}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[15px] font-semibold whitespace-nowrap tabular-nums">{formatPrice(g.amount)}</div>
                <div className="text-xs text-muted">{planName(g.plan)}</div>
              </div>
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
              <span className={cn("rounded-full px-2.5 py-1 font-medium whitespace-nowrap", g.status === "paid" ? "bg-emerald-50 text-emerald-700" : g.status === "cancelled" ? "bg-cream text-muted" : "bg-amber-50 text-amber-800")}>{statusLabel[g.status]}</span>
              {g.status === "pending_payment" && g.paymentClaimedAt ? <span className="rounded-md bg-amber-50 px-2 py-1 font-medium text-amber-800">сообщил об оплате</span> : null}
              {g.promo ? <span className="rounded-md bg-cream px-2 py-1 font-mono text-ink-soft">{g.promo.code}</span> : null}
              {g.promo && g.promo.usedCount > 0 ? <span className="text-emerald-700">использован</span> : null}
              <span className="ml-auto text-muted">{formatDate(g.createdAt)}</span>
            </div>
            <div className="mt-2">
              <GiftActions id={g.id} status={g.status} canResend={!!g.recipientEmail} />
            </div>
          </li>
        ))}
        {!list.length ? <li className="rounded-2xl border border-dashed border-line bg-white px-4 py-10 text-center text-sm text-muted">Сертификатов пока нет</li> : null}
      </ul>
      <div className="hidden overflow-x-auto rounded-2xl border border-line bg-white lg:block">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-line text-left text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">№</th>
              <th className="px-3 py-3 font-medium">Покупатель</th>
              <th className="px-3 py-3 font-medium">Получатель</th>
              <th className="px-3 py-3 font-medium">Книга</th>
              <th className="px-3 py-3 font-medium">Код</th>
              <th className="px-3 py-3 font-medium">Статус</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {list.map((g) => (
              <tr key={g.id} className="align-top">
                <td className="px-4 py-3">
                  <div className="font-medium">{g.number}</div>
                  <div className="text-xs text-muted">{formatDate(g.createdAt)}</div>
                </td>
                <td className="px-3 py-3">
                  <div>{g.buyerName}</div>
                  <div className="text-xs text-muted">{g.buyerEmail}{g.buyerPhone ? ` · ${g.buyerPhone}` : ""}</div>
                </td>
                <td className="px-3 py-3">
                  <div>{g.recipientName}</div>
                  <div className="text-xs text-muted">
                    {g.recipientEmail ? `${g.recipientEmail} · ${g.sentAt ? "отправлено" : g.sendAt ? `отправка ${ru.date(parseDay(g.sendAt))}` : "ждёт отправки"}` : "вручит сам(а)"}
                  </div>
                </td>
                <td className="px-3 py-3">
                  {planName(g.plan)}
                  <div className="text-xs text-muted">{formatPrice(g.amount)}</div>
                </td>
                <td className="px-3 py-3 font-mono text-xs">
                  {g.promo ? g.promo.code : "—"}
                  {g.promo && g.promo.usedCount > 0 ? <div className="font-sans text-emerald-700">использован</div> : null}
                </td>
                <td className="px-3 py-3">
                  <span className={cn("rounded-full px-2 py-0.5 text-xs", g.status === "paid" ? "bg-emerald-50 text-emerald-700" : g.status === "cancelled" ? "bg-cream text-muted" : "bg-amber-50 text-amber-800")}>
                    {statusLabel[g.status]}
                  </span>
                  {g.status === "pending_payment" && g.paymentClaimedAt ? <div className="mt-1 text-xs text-amber-800">сообщил об оплате</div> : null}
                </td>
                <td className="px-3 py-3">
                  <GiftActions id={g.id} status={g.status} canResend={!!g.recipientEmail} />
                </td>
              </tr>
            ))}
            {!list.length ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted">Сертификатов пока нет</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
