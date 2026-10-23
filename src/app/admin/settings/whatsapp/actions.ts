"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { GowaError, RULE_DAILY_LIMIT_MAX } from "@/modules/messaging";
import { saveSettings } from "@/modules/workspace";
import { isValidTime } from "@/shared/domain/schedule";
import { admin } from "@/i18n/admin";
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

/**
 * Звонки WhatsApp из CRM. Включить можно только со своим шлюзом, который умеет звонки: обычная сборка шлюза ответила бы на
 * звонок ошибкой у каждого менеджера. Шлюзу заново передаётся список событий устройства (в нём входящие звонки).
 */
export async function saveWhatsappCallsAction(enabled: boolean): Promise<Result<{ warning: string | null }>> {
  const staff = await assertStaff("settings.manage");
  const on = z.boolean().parse(enabled);
  let warning: string | null = null;
  if (on) {
    if ((await container().messaging.whatsappProvider()) !== "gowa") return { ok: false, error: "Звонки работают только через свой шлюз GOWA — выберите его выше" };
    const supported = await container().messaging.gowa.callsSupported().catch(() => null);
    if (supported === false) return { ok: false, error: "Шлюз WhatsApp не умеет звонки: нужна сборка со звонками (deploy/gowa-beta-build.sh) и WHATSAPP_BETA_CALL_ENABLED=true" };
    if (supported === null) warning = "Включено, но шлюз не удалось проверить: убедитесь, что он запущен, номер привязан и это сборка со звонками";
  }
  await saveSettings({ "gowa.calls": on ? "on" : "off" }, staff.user.id);
  await audit(staff, "settings.update", "settings", "whatsapp", { calls: on });
  if (on) {
    try {
      await container().messaging.connectGowa();
    } catch (err) {
      warning ??= `Включено, но шлюз не подключён: ${gowaError(err).error}`;
    }
  }
  revalidatePath("/admin", "layout");
  return { ok: true, warning };
}

const ruleSendingSchema = z.object({ from: z.string().refine(isValidTime), to: z.string().refine(isValidTime), dailyLimit: z.number().int().min(0).max(RULE_DAILY_LIMIT_MAX) });

/**
 * Защита номера (automation-15): окно по Алматы, в которое правила автоматизаций пишут клиентам первыми, и сколько
 * таких сообщений уходит за сутки (0 — не пишут).
 */
export async function saveRuleSendingAction(input: z.input<typeof ruleSendingSchema>): Promise<Result> {
  const staff = await assertStaff("settings.manage");
  const times = ruleSendingSchema.pick({ from: true, to: true }).safeParse(input);
  if (!times.success) return { ok: false, error: admin.ruleWindowInvalid };
  const parsed = ruleSendingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: admin.ruleDailyLimitInvalid(RULE_DAILY_LIMIT_MAX) };
  const { from, to, dailyLimit } = parsed.data;
  await saveSettings({ "whatsapp.rulesWindow": JSON.stringify({ from, to }), "whatsapp.rulesDailyLimit": String(dailyLimit) }, staff.user.id);
  await audit(staff, "settings.update", "settings", "whatsapp", { rulesWindow: `${from}–${to}`, rulesDailyLimit: dailyLimit });
  revalidatePath("/admin/settings");
  return { ok: true };
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

/** Загрузить из шлюза историю переписки с клиентами (WhatsApp передал её при привязке номера). Повтор — без дублей. */
export async function gowaImportHistoryAction(): Promise<Result<{ chats: number; withClients: number; imported: number }>> {
  const staff = await assertStaff("settings.manage");
  try {
    const r = await container().messaging.importGowaHistory();
    await audit(staff, "settings.update", "settings", "whatsapp", { gowa: "import_history", ...r });
    revalidatePath("/admin/chats");
    return { ok: true, ...r };
  } catch (err) {
    return gowaError(err);
  }
}
