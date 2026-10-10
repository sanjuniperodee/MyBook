import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { api, apiStaff, HttpError } from "@/server/api";
import { audit, can, canSeeAssigned } from "@/server/access";
import { container } from "@/server/container";
import { formatPrice } from "@/config/site";

/** Удалить ошибочный платёж: деньги пропадают из выручки, в сделке остаётся запись о том, кто и что удалил. */
export const DELETE = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const staff = await apiStaff(req, "deals.edit");
  const { id } = await params;
  const c = container();
  const payment = await c.sales.payments.find(id);
  if (!payment) throw new HttpError(404, "notFound");
  const deal = await c.sales.deals.findById(payment.dealId);
  if (!deal || !canSeeAssigned(staff, deal.assigneeId)) throw new HttpError(403, "forbidden");
  await c.sales.payments.remove(payment.id);
  const actor = { userId: staff.user.id, name: staff.user.name || staff.user.email, seesAll: staff.scope === "all", allTasks: can(staff, "tasks.all") };
  await c.clients.notes.add(actor, { kind: "note", text: `Платёж удалён: ${formatPrice(payment.amount)}`, dealId: deal.id, clientId: deal.clientId ?? undefined });
  await audit(staff, "payment.remove", "deal", deal.id, { payment: payment.id, amount: payment.amount, paidAt: payment.paidAt });
  revalidatePath(`/admin/deals/${deal.id}`);
  revalidatePath("/admin");
  revalidatePath("/admin/analytics");
  return NextResponse.json({ ok: true });
});
