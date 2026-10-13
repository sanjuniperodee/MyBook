"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { GowaError } from "@/modules/messaging";
import { fromEnv, saveSettings } from "@/modules/workspace";
import { assertStaff, audit } from "@/server/access";
import { container } from "@/server/container";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const gowaError = (err: unknown): { ok: false; error: string } => {
  if (GowaError.is(err)) return { ok: false, error: err.message };
  throw err;
};

const settingsSchema = z.object({
  provider: z.enum(["wazzup", "gowa"]),
  baseUrl: z.string().trim().max(200).refine((v) => !v || /^https?:\/\/[^\s]+$/.test(v), "Адрес шлюза должен начинаться с http:// или https://"),
  /** Пусто — не менять сохранённый. */
  basicAuth: z.string().trim().max(200).refine((v) => !v || /^[^:\s]+:\S+$/.test(v), "Логин и пароль шлюза — в виде логин:пароль"),
  clearAuth: z.boolean(),
});

/** Через что работает WhatsApp и как достучаться до своего шлюза. */
export async function saveWhatsappSettingsAction(input: z.input<typeof settingsSchema>): Promise<Result> {
  const staff = await assertStaff("settings.manage");
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { provider, baseUrl, basicAuth, clearAuth } = parsed.data;
  await saveSettings(
    {
      ...(fromEnv("whatsapp.provider") ? {} : { "whatsapp.provider": provider }),
      ...(fromEnv("gowa.baseUrl") ? {} : { "gowa.baseUrl": baseUrl.replace(/\/+$/, "") }),
      ...(fromEnv("gowa.basicAuth") ? {} : basicAuth ? { "gowa.basicAuth": basicAuth } : clearAuth ? { "gowa.basicAuth": "" } : {}),
    },
    staff.user.id,
  );
  await audit(staff, "settings.update", "settings", "whatsapp", { provider, baseUrl });
  revalidatePath("/admin/settings");
  return { ok: true };
}

/** QR для привязки номера магазина: WhatsApp → Настройки → Связанные устройства → Привязать устройство. */
export async function gowaQrAction(): Promise<Result<{ image: string; seconds: number }>> {
  await assertStaff("settings.manage");
  try {
    return { ok: true, ...(await container().messaging.gowa.loginQr()) };
  } catch (err) {
    return gowaError(err);
  }
}

/** Код привязки вместо QR (когда телефон магазина далеко от компьютера). */
export async function gowaPairCodeAction(phone: string): Promise<Result<{ code: string }>> {
  await assertStaff("settings.manage");
  const digits = z.string().max(32).parse(phone).replace(/\D/g, "");
  if (digits.length < 10) return { ok: false, error: "Укажите номер WhatsApp магазина" };
  try {
    return { ok: true, code: await container().messaging.gowa.loginCode(digits) };
  } catch (err) {
    return gowaError(err);
  }
}

export async function gowaStatusAction() {
  await assertStaff("settings.manage");
  return container().messaging.gowa.status();
}

/** Отвязать номер от шлюза (WhatsApp на телефоне продолжит работать как обычно). */
export async function gowaLogoutAction(): Promise<Result> {
  const staff = await assertStaff("settings.manage");
  try {
    await container().messaging.gowa.logout();
  } catch (err) {
    return gowaError(err);
  }
  await audit(staff, "settings.update", "settings", "whatsapp", { gowa: "logout" });
  revalidatePath("/admin/settings");
  return { ok: true };
}
