import { NextResponse } from "next/server";
import { apiStaff } from "@/server/api";
import { can, staffViewer } from "@/server/access";
import { container } from "@/server/container";
import { mobile } from "@/server/mobile-api";
import { nowMs } from "@/lib/dates";
import { formatPrice, getPlan } from "@/config/site";
import { planName } from "@/i18n/labels";
import { staffLabel } from "@/shared/domain/staff";
import { orderStatusLabels } from "@/modules/ordering/ui/status";
import { ORDER_STATUSES } from "@/shared/domain/orders";

export const dynamic = "force-dynamic";

/**
 * Заказы для производства (канбан доски CRM): карточки за 30 дней по статусам с признаками «срочно», «сюрприз», «клиент
 * сообщил об оплате», сроком и ответственным. Статусы и их подписи — в ответе, приложение рисует колонки.
 */
export const GET = mobile(async (req) => {
  const staff = await apiStaff(req, "orders.view");
  const monthAgo = new Date(nowMs() - 30 * 86_400_000);
  const [rows, admins] = await Promise.all([container().reporting.productionBoard(monthAgo, staffViewer(staff)), container().access.queries.allStaff()]);
  const names = new Map(admins.map((a) => [a.id, staffLabel(a)]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return NextResponse.json({
    canEdit: can(staff, "orders.edit"),
    statuses: ORDER_STATUSES.map((s) => ({ key: s, label: orderStatusLabels[s] })),
    orders: rows.map((o) => {
      const plan = getPlan(o.plan);
      return {
        id: o.id,
        number: o.number,
        status: o.status,
        contactName: o.contactName,
        planName: planName(o.plan),
        printed: !!plan?.printed,
        quantity: o.quantity,
        amount: o.amount,
        amountLabel: formatPrice(o.amount),
        desiredDate: o.desiredDate,
        daysLeft: o.desiredDate ? Math.round((new Date(`${o.desiredDate}T00:00:00`).getTime() - today.getTime()) / 86_400_000) : null,
        claimed: o.status === "pending_payment" && !!o.paymentClaimedAt,
        surprise: o.surprise,
        giftNote: !!o.giftNote,
        express: o.plan === "premium" || o.addons.includes("express"),
        assignee: o.assigneeId ? (names.get(o.assigneeId) ?? null) : null,
        ageDays: Math.floor((nowMs() - o.createdAt.getTime()) / 86_400_000),
      };
    }),
  });
});
