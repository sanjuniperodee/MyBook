import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { giftCards } from "@/lib/db/schema";
import { formatPrice, getPlan } from "@/config/site";
import { formatDate, cn } from "@/lib/utils";
import { humanDay } from "@/lib/occasions";
import { GiftActions } from "./GiftActions";

const statusLabel = { pending_payment: "Ждёт оплаты", paid: "Оплачен", cancelled: "Отменён" } as const;

export default async function AdminGifts() {
  const list = await db.query.giftCards.findMany({ orderBy: desc(giftCards.createdAt), with: { promo: true }, limit: 300 });
  const paid = list.filter((g) => g.status === "paid");
  const redeemed = paid.filter((g) => g.promo && g.promo.usedCount > 0);
  const revenue = paid.reduce((s, g) => s + g.amount, 0);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold">Подарочные сертификаты</h1>
        <Link href="/gift" target="_blank" className="text-sm text-muted underline">Страница покупки</Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
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
      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
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
                    {g.recipientEmail ? `${g.recipientEmail} · ${g.sentAt ? "отправлено" : g.sendAt ? `отправка ${humanDay(g.sendAt)}` : "ждёт отправки"}` : "вручит сам(а)"}
                  </div>
                </td>
                <td className="px-3 py-3">
                  {getPlan(g.plan)?.name}
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
