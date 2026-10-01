"use server";

import { container } from "@/server/container";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { crmTemplates } from "@/lib/db/schema";
import { assertStaff, audit } from "@/server/access";
import { ensureToken, fromEnv, getSettings, saveSettings, type SettingKey } from "@/lib/crm/settings";
import { randomToken } from "@/shared/crypto";
import { isValidTime } from "@/lib/crm/schedule";
import { listChannels, registerWebhook, WazzupError } from "@/lib/crm/wazzup";
import { AssistantError } from "@/modules/assistant";

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
      ...(provider.data === "zadarma"
        ? { ...(fromEnv("zadarma.pbxId") ? {} : { "zadarma.pbxId": String(form.get("pbxId") ?? "").replace(/\D/g, "").slice(0, 12) }), "zadarma.webphone": form.get("webphone") === "on" ? "on" : "off" }
        : {}),
    },
    staff.user.id,
  );
  if (provider.data === "pbx") await ensureToken("pbx.token");
  await audit(staff, "settings.update", "settings", "telephony", { provider: provider.data });
  revalidatePath("/admin/settings");
  return { ok: "Сохранено" };
}

/** Новый токен вебхука: старый адрес перестаёт работать (если он утёк). */
export async function rotateTokenAction(key: "wazzup.webhookToken" | "pbx.token" | "email.webhookToken") {
  const staff = await assertStaff("settings.manage");
  const k = z.enum(["wazzup.webhookToken", "pbx.token", "email.webhookToken"]).parse(key);
  if (fromEnv(k)) throw new Error("Токен задан переменной окружения");
  await saveSettings({ [k]: randomToken() }, staff.user.id);
  await audit(staff, "settings.update", "settings", k, { rotated: true });
  revalidatePath("/admin/settings");
}

export async function saveCrmSettingsAction(_: SettingsState, form: FormData): Promise<SettingsState> {
  const staff = await assertStaff("settings.manage");
  const parsed = z
    .object({
      slaMinutes: z.coerce.number().int().min(1, "Норматив ответа — от 1 минуты").max(1440),
      from: z.string().refine(isValidTime, "Время начала в формате ЧЧ:ММ"),
      to: z.string().refine(isValidTime, "Время окончания в формате ЧЧ:ММ"),
      autoDealFrom: z.enum(["off", "registered", "book_started", "book_half", "book_ready"]),
      maxDiscount: z.coerce.number().int().min(0).max(50, "Скидка из чата — не больше 50%"),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const days = form.getAll("days").map(Number).filter((d) => d >= 1 && d <= 7);
  if (!days.length) return { error: "Выберите хотя бы один рабочий день" };
  const d = parsed.data;
  await saveSettings(
    {
      "crm.slaMinutes": String(d.slaMinutes),
      "crm.workHours": JSON.stringify({ days: [...new Set(days)].sort(), from: d.from, to: d.to }),
      "crm.autoDealFrom": d.autoDealFrom,
      "crm.unsorted": form.get("unsorted") === "on" ? "on" : "off",
      "crm.maxDiscount": String(d.maxDiscount),
      "widget.enabled": form.get("widgetEnabled") === "on" ? "on" : "off",
      "widget.chat": form.get("widgetChat") === "on" ? "on" : "off",
    },
    staff.user.id,
  );
  await audit(staff, "settings.update", "settings", "crm", { ...d, days });
  revalidatePath("/admin/settings");
  return { ok: "Сохранено" };
}

// ─── почта ─────────────────────────────────────────────────────────────────

export async function saveEmailAction(_: SettingsState, form: FormData): Promise<SettingsState> {
  const staff = await assertStaff("settings.manage");
  const parsed = z
    .object({
      imapHost: z.string().trim().max(200).regex(/^[a-z0-9.-]*$/i, "Сервер IMAP — например, imap.yandex.ru"),
      imapPort: z.coerce.number().int().min(1).max(65535).default(993),
      imapUser: z.string().trim().max(200),
      imapMailbox: z.string().trim().max(100).default("INBOX"),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const prev = await getSettings(["email.imapHost", "email.imapUser", "email.imapMailbox"]);
  const changedBox = prev["email.imapHost"] !== d.imapHost || prev["email.imapUser"] !== d.imapUser || prev["email.imapMailbox"] !== d.imapMailbox;
  await saveSettings(
    {
      ...(fromEnv("email.imapHost") ? {} : { "email.imapHost": d.imapHost }),
      ...(fromEnv("email.imapPort") ? {} : { "email.imapPort": String(d.imapPort) }),
      ...(fromEnv("email.imapUser") ? {} : { "email.imapUser": d.imapUser }),
      ...secretValue(form, "imapPassword", "email.imapPassword"),
      "email.imapMailbox": d.imapMailbox || "INBOX",
      // Другой ящик — начинаем с писем за последние сутки, а не с UID старого ящика.
      ...(changedBox ? { "email.imapLastUid": "" } : {}),
    },
    staff.user.id,
  );
  await ensureToken("email.webhookToken");
  await audit(staff, "settings.update", "settings", "email", { imapHost: d.imapHost, imapUser: d.imapUser });
  revalidatePath("/admin/settings");
  return { ok: "Сохранено" };
}

export async function testImapAction(): Promise<{ ok: boolean; message: string }> {
  await assertStaff("settings.manage");
  try {
    const { testImap } = await import("@/lib/crm/email");
    return { ok: true, message: await testImap() };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Не удалось подключиться" };
  }
}

// ─── AI-помощник ───────────────────────────────────────────────────────────

export async function saveAiAction(_: SettingsState, form: FormData): Promise<SettingsState> {
  const staff = await assertStaff("settings.manage");
  const baseUrl = String(form.get("aiBaseUrl") ?? "").trim();
  if (baseUrl && !/^https?:\/\/[^\s]+$/.test(baseUrl)) return { error: "Адрес API должен начинаться с https://" };
  const knowledge = String(form.get("knowledge") ?? "").trim();
  if (knowledge.length > 6000) return { error: "База знаний — не больше 6000 символов" };
  await saveSettings(
    {
      ...secretValue(form, "aiKey", "ai.apiKey"),
      ...(fromEnv("ai.baseUrl") ? {} : { "ai.baseUrl": baseUrl }),
      "ai.enabled": form.get("enabled") === "on" ? "on" : "off",
      "ai.knowledge": knowledge,
    },
    staff.user.id,
  );
  await audit(staff, "settings.update", "settings", "ai", { enabled: form.get("enabled") === "on", knowledge: knowledge.length });
  revalidatePath("/admin/settings");
  return { ok: "Сохранено" };
}

export async function testAiAction(): Promise<{ ok: boolean; message: string }> {
  await assertStaff("settings.manage");
  try {
    const answer = await container().assistant.service.test();
    return { ok: true, message: `Подключено, Claude отвечает: «${answer}»` };
  } catch (err) {
    return { ok: false, message: AssistantError.is(err) ? err.message : "Не удалось связаться с Claude API" };
  }
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

const botSchema = z.object({
  mode: z.enum(["off", "always", "off_hours"]),
  greeting: z.string().trim().max(500),
  finish: z.string().trim().max(500),
  questions: z.array(z.object({ text: z.string().trim().min(1, "Текст вопроса").max(400), field: z.string().min(1, "Поле для ответа").max(40) })).max(6),
});

export async function saveBotAction(input: z.input<typeof botSchema>): Promise<SettingsState> {
  const staff = await assertStaff("settings.manage");
  const parsed = botSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { mode, ...config } = parsed.data;
  if (mode !== "off" && !config.questions.length) return { error: "Добавьте хотя бы один вопрос" };
  await saveSettings({ "bot.mode": mode, "bot.config": JSON.stringify(config) }, staff.user.id);
  await audit(staff, "settings.update", "settings", "bot", { mode, questions: config.questions.length });
  revalidatePath("/admin/settings");
  return { ok: "Сохранено" };
}
