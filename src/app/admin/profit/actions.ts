"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertStaff, audit } from "@/server/access";
import { getSetting, saveSettings } from "@/modules/workspace";

const ratesSchema = z
  .array(z.object({ form: z.string().trim().min(1).max(60), rate: z.coerce.number().min(0, "Процент — от 0 до 100").max(100, "Процент — от 0 до 100") }))
  .max(30);

/**
 * Проценты комиссий банка по формам оплаты сделки (Kaspi Рассрочка, Red…): по ним «Прибыль» и «Реестр продаж» считают
 * комиссию с денег сделки. Право «Вести расходы», изменение — в журнал действий.
 */
export async function saveFeeRatesAction(input: z.input<typeof ratesSchema>): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await assertStaff("finance.manage");
  const parsed = ratesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message === "Invalid input" ? "Проверьте проценты: число от 0 до 100" : parsed.error.issues[0].message };
  const next = Object.fromEntries(parsed.data.map((r) => [r.form, Math.round(r.rate * 100) / 100]));
  const before = await getSetting("finance.fees");
  await saveSettings({ "finance.fees": JSON.stringify(next) }, staff.user.id);
  await audit(staff, "settings.update", "settings", "finance.fees", { from: before, to: next });
  revalidatePath("/admin/profit");
  revalidatePath("/admin/sales");
  return { ok: true };
}
