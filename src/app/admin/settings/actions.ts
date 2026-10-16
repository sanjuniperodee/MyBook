"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertStaff, audit } from "@/server/access";
import { fromEnv, saveSettings } from "@/modules/workspace";
import { randomToken } from "@/shared/crypto";

/** Новый токен вебхука: старый адрес перестаёт работать (если он утёк). */
export async function rotateTokenAction(key: "wazzup.webhookToken" | "pbx.token" | "email.webhookToken") {
  const staff = await assertStaff("settings.manage");
  const k = z.enum(["wazzup.webhookToken", "pbx.token", "email.webhookToken"]).parse(key);
  if (fromEnv(k)) throw new Error("Токен задан переменной окружения");
  await saveSettings({ [k]: randomToken() }, staff.user.id);
  await audit(staff, "settings.update", "settings", k, { rotated: true });
  revalidatePath("/admin/settings");
}
