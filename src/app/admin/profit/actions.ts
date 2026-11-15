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
 * комиссию с денег сделки. И налог с выручки, % — «Прибыль» считает его строкой «Налоги». Право «Вести расходы», изменение — в журнал действий.
 */
export async function saveFeeRatesAction(input: z.input<typeof ratesSchema>, taxRate: string | number = ""): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await assertStaff("finance.manage");
  const parsed = ratesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message === "Invalid input" ? "Проверьте проценты: число от 0 до 100" : parsed.error.issues[0].message };
  const tax = Number(String(taxRate).replace(",", ".") || "0");
  if (!Number.isFinite(tax) || tax < 0 || tax > 50) return { ok: false, error: "Налог — число от 0 до 50" };
  const next = Object.fromEntries(parsed.data.map((r) => [r.form, Math.round(r.rate * 100) / 100]));
  const before = { fees: await getSetting("finance.fees"), tax: await getSetting("finance.taxRate") };
  // Ноль — «не считать»: пустое значение удаляет ключ настройки.
  await saveSettings({ "finance.fees": JSON.stringify(next), "finance.taxRate": tax ? String(Math.round(tax * 100) / 100) : "" }, staff.user.id);
  await audit(staff, "settings.update", "settings", "finance.fees", { from: before, to: { fees: next, tax } });
  revalidatePath("/admin/profit");
  revalidatePath("/admin/sales");
  return { ok: true };
}
