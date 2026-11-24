"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertStaff, audit } from "@/server/access";
import { saveSettings } from "@/modules/workspace";
import type { SettingsState } from "../state";
import { secretValue, unlessEnv } from "../form-kit";

/** Ключи OAuth-клиента Google (Google Cloud Console): Client ID открыто, Client secret — зашифрованным. */
export async function saveGoogleAction(_: SettingsState, form: FormData): Promise<SettingsState> {
  const staff = await assertStaff("settings.manage");
  const parsed = z
    .string()
    .trim()
    .max(200)
    .regex(/^([\w.-]+\.apps\.googleusercontent\.com)?$/)
    .safeParse(form.get("clientId") ?? "");
  if (!parsed.success) return { error: "Client ID выглядит как 1234567890-abc….apps.googleusercontent.com" };
  const clientId = parsed.data;
  await saveSettings({ ...unlessEnv("google.clientId", clientId), ...secretValue(form, "clientSecret", "google.clientSecret") }, staff.user.id);
  await audit(staff, "settings.update", "settings", "google", { clientId: !!clientId });
  revalidatePath("/admin/settings");
  revalidatePath("/admin/tasks/calendar");
  return { ok: "Сохранено. Сотрудники подключают свой календарь в «Задачи → Календарь»." };
}
