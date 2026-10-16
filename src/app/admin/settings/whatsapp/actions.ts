"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { GowaError } from "@/modules/messaging";
import { saveSettings } from "@/modules/workspace";
import { assertStaff, audit } from "@/server/access";
import { container } from "@/server/container";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const gowaError = (err: unknown): { ok: false; error: string } => {
  if (GowaError.is(err)) return { ok: false, error: err.message };
  throw err;
};

const httpUrl = (message: string) => z.string().trim().max(300).refine((v) => !v || /^https?:\/\/[^\s]+$/.test(v), message);

const settingsSchema = z.object({
  provider: z.enum(["wazzup", "gowa"]),
  baseUrl: httpUrl("Адрес шлюза должен начинаться с http:// или https://"),
  /** Пусто — не менять сохранённый. */
  basicAuth: z.string().trim().max(200).refine((v) => !v || /^[^:\s]+:\S+$/.test(v), "Логин и пароль шлюза — в виде логин:пароль"),
  clearAuth: z.boolean(),
  /** Пусто — адрес сайта по умолчанию. */
  callbackUrl: httpUrl("Адрес для событий должен начинаться с http:// или https://"),
});

/**
 * Через что работает WhatsApp и как достучаться до своего шлюза. Для GOWA сайт сразу заводит в шлюзе устройство
 * магазина и направляет его события на себя — настраивать шлюз отдельно не нужно.
 */
export async function saveWhatsappSettingsAction(input: z.input<typeof settingsSchema>): Promise<Result<{ warning: string | null }>> {
  const staff = await assertStaff("settings.manage");
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { provider, baseUrl, basicAuth, clearAuth, callbackUrl } = parsed.data;
  await saveSettings(
    {
      "whatsapp.provider": provider,
      "gowa.baseUrl": baseUrl.replace(/\/+$/, ""),
      "gowa.callbackUrl": callbackUrl,
      ...(basicAuth ? { "gowa.basicAuth": basicAuth } : clearAuth ? { "gowa.basicAuth": "" } : {}),
    },
    staff.user.id,
  );
  await audit(staff, "settings.update", "settings", "whatsapp", { provider, baseUrl, callbackUrl });
  revalidatePath("/admin/settings");
  if (provider !== "gowa") return { ok: true, warning: null };
  try {
    await container().messaging.connectGowa();
    return { ok: true, warning: null };
  } catch (err) {
    // Настройки сохранены; шлюз пока не отвечает — подключим устройство при следующем сохранении или привязке номера.
    return { ok: true, warning: gowaError(err).error };
  }
}

/** QR для привязки номера магазина: WhatsApp → Настройки → Связанные устройства → Привязать устройство. */
export async function gowaQrAction(): Promise<Result<{ image: string; seconds: number }>> {
  await assertStaff("settings.manage");
  try {
    await container().messaging.connectGowa();
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
    await container().messaging.connectGowa();
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
