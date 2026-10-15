"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertStaff, audit } from "@/server/access";
import { ensureToken, saveSettings } from "@/modules/workspace";
import type { SettingsState } from "../state";
import { secretValue, unlessEnv } from "../form-kit";

export async function saveTelephonyAction(_: SettingsState, form: FormData): Promise<SettingsState> {
  const staff = await assertStaff("settings.manage");
  const provider = z.enum(["off", "zadarma", "pbx"]).safeParse(form.get("provider"));
  if (!provider.success) return { error: "Выберите АТС" };
  await saveSettings(
    {
      ...unlessEnv("telephony.provider", provider.data),
      ...secretValue(form, "zadarmaKey", "zadarma.key"),
      ...secretValue(form, "zadarmaSecret", "zadarma.secret"),
      ...(provider.data === "zadarma"
        ? { ...unlessEnv("zadarma.pbxId", String(form.get("pbxId") ?? "").replace(/\D/g, "").slice(0, 12)), "zadarma.webphone": form.get("webphone") === "on" ? "on" : "off" }
        : {}),
    },
    staff.user.id,
  );
  if (provider.data === "pbx") await ensureToken("pbx.token");
  await audit(staff, "settings.update", "settings", "telephony", { provider: provider.data });
  revalidatePath("/admin/settings");
  return { ok: "Сохранено" };
}
