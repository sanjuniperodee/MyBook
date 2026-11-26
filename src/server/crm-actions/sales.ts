"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { container } from "@/server/container";
import { assertStaff, audit, canWork } from "@/server/access";
import { uuid } from "@/server/input";
import { listFields } from "@/modules/workspace";
import { PAY_FORM_KEY } from "@/shared/domain/expenses";

/**
 * Форма оплаты сделки из «Реестра продаж» (то же поле, что в карточке сделки): Kaspi Gold, Рассрочка, Red… Пусто — снять.
 * Нужны право менять сделки и доступ к этой сделке; значение — только из вариантов поля.
 */
export async function setPayFormAction(dealId: string, form: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await assertStaff("deals.edit");
  const id = uuid.parse(dealId);
  const value = z.string().trim().max(60).parse(form);
  const c = container();
  const deal = await c.sales.deals.findById(id);
  if (!deal) return { ok: false, error: "Сделка не найдена — обновите страницу" };
  if (!canWork(staff, deal.assigneeId)) return { ok: false, error: "Это сделка другого сотрудника" };
  const field = (await listFields("deal")).find((f) => f.key === PAY_FORM_KEY);
  if (value && !field?.options.includes(value)) return { ok: false, error: "Такой формы оплаты нет в поле сделки" };
  await c.sales.deals.setField(id, PAY_FORM_KEY, value || null);
  await audit(staff, "deal.pay_form", "deal", id, { form: value || null });
  revalidatePath("/admin/sales");
  revalidatePath("/admin/profit");
  return { ok: true };
}
