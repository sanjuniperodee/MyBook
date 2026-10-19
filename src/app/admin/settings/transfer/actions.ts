"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertStaff, audit } from "@/server/access";
import { saveSettings } from "@/modules/workspace";
import { normalizePhone } from "@/shared/domain/phone";
import type { SettingsState } from "../state";

/** Реквизиты перевода Kaspi, которые видят клиенты (заказ, сертификат, счёт из чата). Пустой номер — перевод не показываем. */
export async function saveTransferAction(_: SettingsState, form: FormData): Promise<SettingsState> {
  const staff = await assertStaff("settings.manage");
  const parsed = z.object({ phone: z.string().trim().max(40).default(""), name: z.string().trim().max(80).default("") }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Проверьте номер и имя получателя" };
  const digits = normalizePhone(parsed.data.phone);
  if (parsed.data.phone && digits.length < 10) return { error: "Номер получателя — 10–11 цифр" };
  if (digits && !parsed.data.name) return { error: "Укажите имя получателя — клиент сверит его в Kaspi перед переводом" };
  await saveSettings({ "pay.transferPhone": digits, "pay.transferName": parsed.data.name }, staff.user.id);
  await audit(staff, "settings.update", "settings", "transfer", { phone: digits ? `…${digits.slice(-4)}` : "", name: parsed.data.name });
  revalidatePath("/admin/settings");
  return { ok: digits ? "Сохранено — клиенты видят эти реквизиты" : "Перевод выключен — клиенты платят через Kaspi Pay или картой" };
}
