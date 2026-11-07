"use server";

import { revalidatePath } from "next/cache";
import { uuid } from "@/server/input";
import { assertStaff, assertVisible, audit } from "@/server/access";
import { container } from "@/server/container";

export interface FinanceState {
  ok?: string;
  error?: string;
}

/**
 * «Проверено»: руководитель сверил ручной платёж или возврат сделки (перевод с чеком) с поступлением на счёт. Только
 * team.manage; роль «только свои» — по своим сделкам; свою запись — нельзя. Онлайн-платёж и уже проверенный не отмечаются.
 */
export async function reviewDealPaymentAction(paymentId: string): Promise<FinanceState> {
  const staff = await assertStaff("team.manage");
  const id = uuid.parse(paymentId);
  const sales = container().sales;
  const payment = await sales.payments.find(id);
  if (!payment) return { error: "Платёж не найден" };
  if (staff.scope !== "all") assertVisible(staff, (await sales.deals.findById(payment.dealId))?.assigneeId);
  // Сверка — второй парой глаз: свою запись денег (или возврата) сотрудник не подтверждает. Владелец — может: проверять его некому.
  if (payment.createdById === staff.user.id && !staff.context.isOwner) return { error: "Проверяет другой сотрудник — свою запись подтвердить нельзя" };
  const p = await sales.payments.review(id, staff.user.id);
  if (!p) return { error: "Платёж не найден, онлайн или уже проверен" };
  await audit(staff, "payment.review", "deal", p.dealId, { payment: p.id, amount: p.amount, kind: p.kind });
  revalidatePath("/admin/finance");
  revalidatePath(`/admin/deals/${p.dealId}`);
  return { ok: "Отмечено: проверено" };
}
