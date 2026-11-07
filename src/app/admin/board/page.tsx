import { planName } from "@/i18n/labels";
import { nowMs } from "@/lib/dates";
import { PageHeader } from "@/components/admin/PageHeader";
import { OrdersViews } from "../orders/OrdersViews";
import { container } from "@/server/container";
import { requireStaff, staffViewer } from "@/server/access";
import { staffOptions } from "@/modules/access/ui";
import { staffLabel } from "@/shared/domain/staff";
import { formatPrice, getPlan } from "@/config/site";
import { Board, type BoardCard } from "./Board";
import { OrdersMobile } from "./OrdersMobile";

export const metadata = { title: "Производство" };

export default async function BoardPage() {
  const staff = await requireStaff("orders.view");
  const admin = staff.user;
  const monthAgo = new Date(nowMs() - 30 * 86_400_000);
  const [rows, admins] = await Promise.all([
    container().reporting.productionBoard(monthAgo, staffViewer(staff)),
    container().access.queries.allStaff(),
  ]);
  const byId = new Map(admins.map((a) => [a.id, staffLabel(a)]));
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
      planName: planName(o.plan),
      printed: !!plan?.printed,
      quantity: o.quantity,
      amountLabel: formatPrice(o.amount),
      desiredDate: o.desiredDate,
      daysLeft: o.desiredDate ? Math.round((new Date(`${o.desiredDate}T00:00:00`).getTime() - today.getTime()) / 86_400_000) : null,
      claimed: o.status === "pending_payment" && !!o.paymentClaimedAt,
      surprise: o.surprise,
      giftNote: !!o.giftNote,
      express: o.plan === "premium" || o.addons.includes("express"),
      assigneeId: o.assigneeId,
      assigneeLabel: o.assigneeId ? (byId.get(o.assigneeId) ?? null) : null,
      ageDays: Math.floor((nowMs() - o.createdAt.getTime()) / 86_400_000),
      dealNumber: o.dealNumber,
    };
  });
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Производство" actions={<OrdersViews active="board" />}>
        <span className="max-lg:hidden">Заказы за 30 дней по статусам. Перетащите карточку в другую колонку — клиент получит письмо о смене статуса.</span>
        <span className="lg:hidden">Заказы за 30 дней по статусам.</span>
      </PageHeader>
      <OrdersMobile cards={cards} />
      <div className="hidden lg:block">
        <Board initial={cards} admins={staffOptions(admins)} me={admin.id} />
      </div>
    </div>
  );
}
