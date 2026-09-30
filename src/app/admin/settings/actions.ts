"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { crmTemplates } from "@/lib/db/schema";
import { assertStaff, audit } from "@/lib/crm/rbac";
import { ensureToken, fromEnv, saveSettings, type SettingKey } from "@/lib/crm/settings";
import { randomToken } from "@/lib/crm/crypto";
import { listChannels, registerWebhook, WazzupError } from "@/lib/crm/wazzup";

export interface SettingsState {
  error?: string;
  ok?: string;
}

/** Пустое поле секрета = «не менять»; чтобы удалить ключ, есть отдельная галочка. */
function secretValue(form: FormData, name: string, key: SettingKey): Partial<Record<SettingKey, string>> {
  if (fromEnv(key)) return {};
  if (form.get(`${name}Clear`) === "on") return { [key]: "" };
  const v = String(form.get(name) ?? "").trim();
  return v ? { [key]: v } : {};
}

export async function saveWazzupAction(_: SettingsState, form: FormData): Promise<SettingsState> {
  const staff = await assertStaff("settings.manage");
  const baseUrl = String(form.get("baseUrl") ?? "").trim();
  if (baseUrl && !/^https?:\/\/[^\s]+$/.test(baseUrl)) return { error: "Адрес API должен начинаться с https://" };
  const channelId = String(form.get("channelId") ?? "").trim().slice(0, 100);
  await saveSettings({ ...secretValue(form, "apiKey", "wazzup.apiKey"), ...(fromEnv("wazzup.baseUrl") ? {} : { "wazzup.baseUrl": baseUrl }), ...(fromEnv("wazzup.channelId") ? {} : { "wazzup.channelId": channelId }) }, staff.user.id);
  await ensureToken("wazzup.webhookToken");
  await audit(staff, "settings.update", "settings", "wazzup", { channelId, baseUrl: baseUrl || null });
  revalidatePath("/admin/settings");
  return { ok: "Сохранено" };
}

export async function testWazzupAction(): Promise<{ ok: boolean; message: string; channels?: { id: string; label: string; state: string }[] }> {
  await assertStaff("settings.manage");
  try {
    const channels = await listChannels();
    return {
      ok: true,
      message: channels.length ? `Подключено. Каналов: ${channels.length}` : "Ключ верный, но в Wazzup нет подключённых каналов",
      channels: channels.map((c) => ({ id: c.channelId, label: `${c.transport} · ${c.plainId || c.name || c.channelId}`, state: c.state })),
    };
  } catch (err) {
    return { ok: false, message: err instanceof WazzupError ? err.message : "Не удалось связаться с Wazzup" };
  }
}

export async function registerWazzupWebhookAction(): Promise<{ ok: boolean; message: string }> {
  const staff = await assertStaff("settings.manage");
  try {
    const uri = await registerWebhook(await ensureToken("wazzup.webhookToken"));
    await audit(staff, "settings.update", "settings", "wazzup.webhook", {});
    return { ok: true, message: `Вебхук подключён: ${uri.replace(/token=[^&]+/, "token=••••")}` };
  } catch (err) {
    return { ok: false, message: err instanceof WazzupError ? err.message : "Не удалось подключить вебхук" };
  }
}

export async function saveTelephonyAction(_: SettingsState, form: FormData): Promise<SettingsState> {
  const staff = await assertStaff("settings.manage");
  const provider = z.enum(["off", "zadarma", "pbx"]).safeParse(form.get("provider"));
  if (!provider.success) return { error: "Выберите АТС" };
  await saveSettings(
    {
      ...(fromEnv("telephony.provider") ? {} : { "telephony.provider": provider.data }),
      ...secretValue(form, "zadarmaKey", "zadarma.key"),
      ...secretValue(form, "zadarmaSecret", "zadarma.secret"),
    },
    staff.user.id,
  );
  if (provider.data === "pbx") await ensureToken("pbx.token");
  await audit(staff, "settings.update", "settings", "telephony", { provider: provider.data });
  revalidatePath("/admin/settings");
  return { ok: "Сохранено" };
}

/** Новый токен вебхука: старый адрес перестаёт работать (если он утёк). */
export async function rotateTokenAction(key: "wazzup.webhookToken" | "pbx.token") {
  const staff = await assertStaff("settings.manage");
  const k = z.enum(["wazzup.webhookToken", "pbx.token"]).parse(key);
  if (fromEnv(k)) throw new Error("Токен задан переменной окружения");
  await saveSettings({ [k]: randomToken() }, staff.user.id);
  await audit(staff, "settings.update", "settings", k, { rotated: true });
  revalidatePath("/admin/settings");
}

export async function saveCrmSettingsAction(_: SettingsState, form: FormData): Promise<SettingsState> {
  const staff = await assertStaff("settings.manage");
  const sla = z.coerce.number().int().min(1).max(1440).safeParse(form.get("slaMinutes"));
  if (!sla.success) return { error: "Время ответа — от 1 до 1440 минут" };
  await saveSettings({ "crm.slaMinutes": String(sla.data) }, staff.user.id);
  await audit(staff, "settings.update", "settings", "crm", { slaMinutes: sla.data });
  revalidatePath("/admin/settings");
  return { ok: "Сохранено" };
}

// ─── шаблоны ответов ───────────────────────────────────────────────────────

const templateSchema = z.object({
  id: z.union([z.literal(""), z.string().uuid()]).default(""),
  title: z.string().trim().min(1, "Название шаблона").max(60),
  text: z.string().trim().min(1, "Текст шаблона").max(2000),
});

export async function saveTemplateAction(_: SettingsState, form: FormData): Promise<SettingsState> {
  await assertStaff("settings.manage");
  const parsed = templateSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, title, text } = parsed.data;
  if (id) await db.update(crmTemplates).set({ title, text, updatedAt: new Date() }).where(eq(crmTemplates.id, id));
  else {
    const [{ pos }] = await db.select({ pos: sql<number>`coalesce(max(${crmTemplates.position}), 0)::int` }).from(crmTemplates);
    await db.insert(crmTemplates).values({ title, text, position: pos + 1 });
  }
  revalidatePath("/admin/settings");
  return { ok: "Сохранено" };
}

export async function deleteTemplateAction(id: string) {
  await assertStaff("settings.manage");
  await db.delete(crmTemplates).where(eq(crmTemplates.id, z.string().uuid().parse(id)));
  revalidatePath("/admin/settings");
}
