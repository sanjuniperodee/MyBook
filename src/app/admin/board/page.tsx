import { nowMs } from "@/lib/utils";
import Link from "next/link";
import { and, desc, gte, ne, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth";
import { adminLabel, listAdmins } from "@/lib/crm";
import { formatPrice, getPlan } from "@/config/site";
import { Board, type BoardCard } from "./Board";

export const metadata = { title: "Производство" };

export default async function BoardPage() {
  const admin = await requireAdmin();
  const monthAgo = new Date(nowMs() - 30 * 86_400_000);
  const [rows, admins] = await Promise.all([
    db
      .select()
      .from(orders)
      .where(and(ne(orders.status, "cancelled"), or(ne(orders.status, "delivered"), gte(orders.updatedAt, monthAgo))))
      .orderBy(sql`${orders.desiredDate} asc nulls last`, desc(orders.createdAt))
      .limit(500),
    listAdmins(),
  ]);
  const byId = new Map(admins.map((a) => [a.id, adminLabel(a)]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cards: BoardCard[] = rows.map((o) => {
    const plan = getPlan(o.plan);
    return {
      id: o.id,
      number: o.number,
      status: o.status,
      contactName: o.contactName,
      plan: o.plan,
      planName: plan?.name ?? o.plan,
      printed: !!plan?.printed,
      quantity: o.quantity,
      amountLabel: formatPrice(o.amount),
      desiredDate: o.desiredDate,
      daysLeft: o.desiredDate ? Math.round((new Date(`${o.desiredDate}T00:00:00`).getTime() - today.getTime()) / 86_400_000) : null,
      claimed: o.status === "pending_payment" && !!o.paymentClaimedAt,
      surprise: o.surprise,
      giftNote: !!o.giftNote,
      assigneeId: o.assigneeId,
      assigneeLabel: o.assigneeId ? (byId.get(o.assigneeId) ?? null) : null,
      ageDays: Math.floor((nowMs() - o.createdAt.getTime()) / 86_400_000),
    };
  });
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Производство</h1>
          <p className="text-sm text-muted">Перетаскивайте карточки между колонками — клиент получит письмо о смене статуса.</p>
        </div>
        <Link href="/admin/orders" className="btn btn-outline btn-sm">
          Таблица заказов
        </Link>
      </div>
      <Board initial={cards} admins={admins.map((a) => ({ id: a.id, label: adminLabel(a) }))} me={admin.id} />
    </div>
  );
}
