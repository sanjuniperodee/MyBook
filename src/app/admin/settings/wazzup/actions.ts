"use server";

import { container } from "@/server/container";
import { revalidatePath } from "next/cache";
import { assertStaff, audit } from "@/server/access";
import { ensureToken, saveSettings } from "@/modules/workspace";
import { WazzupError } from "@/modules/messaging";
import { BAD_FORM, textForm } from "@/server/input";
import type { SettingsState } from "../state";
import { secretValue, unlessEnv } from "../form-kit";

export async function saveWazzupAction(_: SettingsState, form: FormData): Promise<SettingsState> {
  const staff = await assertStaff("settings.manage");
  if (!textForm(form).success) return { error: BAD_FORM };
  const baseUrl = String(form.get("baseUrl") ?? "").trim();
  if (baseUrl && !/^https?:\/\/[^\s]+$/.test(baseUrl)) return { error: "Адрес API должен начинаться с https://" };
  const channelId = String(form.get("channelId") ?? "").trim().slice(0, 100);
  await saveSettings({ ...secretValue(form, "apiKey", "wazzup.apiKey"), ...unlessEnv("wazzup.baseUrl", baseUrl), ...unlessEnv("wazzup.channelId", channelId) }, staff.user.id);
  await ensureToken("wazzup.webhookToken");
  await audit(staff, "settings.update", "settings", "wazzup", { channelId, baseUrl: baseUrl || null });
  revalidatePath("/admin/settings");
  return { ok: "Сохранено" };
}

export async function testWazzupAction(): Promise<{ ok: boolean; message: string; channels?: { id: string; label: string; state: string }[] }> {
  await assertStaff("settings.manage");
  try {
    const channels = await container().messaging.wazzup.listChannels();
    return {
      ok: true,
      message: channels.length ? `Подключено. Каналов: ${channels.length}` : "Ключ верный, но в Wazzup нет подключённых каналов",
      channels: channels.map((c) => ({ id: c.channelId, label: `${c.transport} · ${c.plainId || c.name || c.channelId}`, state: c.state })),
    };
  } catch (err) {
    return { ok: false, message: WazzupError.is(err) ? err.message : "Не удалось связаться с Wazzup" };
  }
}

export async function registerWazzupWebhookAction(): Promise<{ ok: boolean; message: string }> {
  const staff = await assertStaff("settings.manage");
  try {
    const uri = await container().messaging.wazzup.registerWebhook(await ensureToken("wazzup.webhookToken"));
    await audit(staff, "settings.update", "settings", "wazzup.webhook", {});
    return { ok: true, message: `Вебхук подключён: ${uri.replace(/token=[^&]+/, "token=••••")}` };
  } catch (err) {
    return { ok: false, message: WazzupError.is(err) ? err.message : "Не удалось подключить вебхук" };
  }
}
