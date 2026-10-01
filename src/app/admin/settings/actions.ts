"use server";

import { container } from "@/server/container";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertStaff, audit } from "@/server/access";
import { ensureToken, fromEnv, getSettings, saveSettings, smtpConfig, smtpFromEnvironment, type SettingKey } from "@/modules/workspace";
import { randomToken } from "@/shared/crypto";
import { isValidTime } from "@/modules/workspace/domain/schedule";
import { listChannels, registerWebhook, WazzupError } from "@/modules/messaging";
import { AssistantError, isAiProvider, providerSettingKeys, type AiProvider } from "@/modules/assistant";

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
    const { testImap } = await import("@/modules/messaging");
    return { ok: true, message: await testImap() };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Не удалось подключиться" };
  }
}

// ─── AI-помощник ───────────────────────────────────────────────────────────

export async function saveAiAction(_: SettingsState, form: FormData): Promise<SettingsState> {
  const staff = await assertStaff("settings.manage");
  const provider = fromEnv("ai.provider") ? null : String(form.get("provider") ?? "anthropic");
  if (provider !== null && !isAiProvider(provider)) return { error: "Выберите провайдера" };
  const p: AiProvider = provider ?? ((await getSettings(["ai.provider"]))["ai.provider"] as AiProvider);
  const keys = providerSettingKeys[isAiProvider(p) ? p : "anthropic"];
  const baseUrl = String(form.get("aiBaseUrl") ?? "").trim().replace(/\/+$/, "");
  if (baseUrl && !/^https?:\/\/[^\s]+$/.test(baseUrl)) return { error: "Адрес API должен начинаться с https://" };
  const model = String(form.get("aiModel") ?? "").trim();
  if (model && !/^[\w.:/@-]{1,100}$/.test(model)) return { error: "Название модели — латиница, цифры и символы . : / - _" };
  if (p === "custom" && (!(baseUrl || fromEnv(keys.baseUrl)) || !model)) return { error: "Для своего сервера укажите адрес API и модель" };
  const knowledge = String(form.get("knowledge") ?? "").trim();
  if (knowledge.length > 6000) return { error: "База знаний — не больше 6000 символов" };
  await saveSettings(
    {
      ...(provider ? { "ai.provider": provider } : {}),
      ...secretValue(form, "aiKey", keys.apiKey),
      ...(fromEnv(keys.baseUrl) ? {} : { [keys.baseUrl]: baseUrl }),
      [keys.model]: model,
      "ai.enabled": form.get("enabled") === "on" ? "on" : "off",
      "ai.knowledge": knowledge,
    },
    staff.user.id,
  );
  await audit(staff, "settings.update", "settings", "ai", { provider: p, model: model || null, enabled: form.get("enabled") === "on", knowledge: knowledge.length });
  revalidatePath("/admin/settings");
  return { ok: "Сохранено" };
}

export async function testAiAction(): Promise<{ ok: boolean; message: string }> {
  await assertStaff("settings.manage");
  const assistant = container().assistant.service;
  const { label, model } = await assistant.describe();
  try {
    const answer = await assistant.test();
    return { ok: true, message: `Подключено, ${label === "AI" ? `модель ${model}` : label} отвечает: «${answer}»` };
  } catch (err) {
    return { ok: false, message: AssistantError.is(err) ? err.message : "Не удалось связаться с AI-сервисом" };
  }
}

// ─── исходящая почта (SMTP) ────────────────────────────────────────────────

const emailRe = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
/** «Имя <адрес>» или просто адрес. */
const isSender = (v: string) => emailRe.test(v) || /^[^<>]{1,80}<[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>$/.test(v);

export async function saveSmtpAction(_: SettingsState, form: FormData): Promise<SettingsState> {
  const staff = await assertStaff("settings.manage");
  const parsed = z
    .object({
      smtpHost: z.string().trim().max(200).regex(/^[a-z0-9.-]*$/i, "Сервер SMTP — например, smtp.yandex.ru"),
      smtpPort: z.union([z.literal(""), z.coerce.number().int().min(1, "Порт — от 1 до 65535").max(65535, "Порт — от 1 до 65535")]).default(""),
      smtpSecure: z.enum(["", "true", "false"]).default(""),
      smtpUser: z.string().trim().max(200).default(""),
      mailFrom: z.string().trim().max(200).default(""),
      mailReplyTo: z.string().trim().max(200).default(""),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (smtpFromEnvironment()) return { error: "Почта задана переменными окружения сервера — меняйте её там" };
  const d = parsed.data;
  if (d.mailFrom && !isSender(d.mailFrom)) return { error: "Отправитель — адрес или «Имя <адрес>»" };
  if (d.mailReplyTo && !emailRe.test(d.mailReplyTo)) return { error: "Адрес для ответов — e-mail" };
  await saveSettings(
    {
      "mail.smtpHost": d.smtpHost,
      "mail.smtpPort": d.smtpPort === "" ? "" : String(d.smtpPort),
      "mail.smtpSecure": d.smtpSecure,
      "mail.smtpUser": d.smtpUser,
      ...secretValue(form, "smtpPassword", "mail.smtpPassword"),
      "mail.from": d.mailFrom,
      "mail.replyTo": d.mailReplyTo,
    },
    staff.user.id,
  );
  await audit(staff, "settings.update", "settings", "smtp", { host: d.smtpHost, port: d.smtpPort, user: d.smtpUser, from: d.mailFrom });
  revalidatePath("/admin/settings");
  return { ok: "Сохранено" };
}

/** Понятный текст ошибки nodemailer. */
function smtpError(err: unknown, host: string, port: number) {
  const e = err as { code?: string; responseCode?: number; message?: string };
  if (e.code === "EAUTH" || e.responseCode === 535) return "Сервер не принял логин или пароль. Для Яндекса, Gmail и Mail.ru нужен пароль приложения, а не пароль от ящика.";
  if (e.code === "EENVELOPE" || e.responseCode === 553 || e.responseCode === 550) return `Сервер отклонил отправителя или получателя: ${e.message ?? ""}. Отправитель должен совпадать с ящиком.`;
  if (e.code === "ETIMEDOUT" || e.code === "ECONNECTION" || e.code === "ESOCKET" || e.code === "EDNS" || e.code === "ECONNREFUSED")
    return `Не удалось подключиться к ${host}:${port} — проверьте адрес, порт и шифрование (465 — SSL, 587 — STARTTLS).`;
  return e.message ? `Ошибка SMTP: ${e.message}` : "Не удалось подключиться к SMTP-серверу";
}

export async function testSmtpAction(): Promise<{ ok: boolean; message: string }> {
  await assertStaff("settings.manage");
  const config = await smtpConfig();
  if (!config) return { ok: false, message: "Сначала укажите и сохраните сервер SMTP" };
  try {
    await container().smtp.verify(config);
    return { ok: true, message: `Подключено к ${config.host}:${config.port}${config.user ? ", логин и пароль приняты" : ""}` };
  } catch (err) {
    return { ok: false, message: smtpError(err, config.host, config.port) };
  }
}

export async function sendTestMailAction(): Promise<{ ok: boolean; message: string }> {
  const staff = await assertStaff("settings.manage");
  const config = await smtpConfig();
  if (!config) return { ok: false, message: "Сначала укажите и сохраните сервер SMTP" };
  try {
    await container().smtp.sendOrThrow(
      staff.user.email,
      "Проверка почты MyBooks",
      container().smtp.layout({ title: "Почта настроена", paragraphs: ["Это тестовое письмо из раздела «Интеграции». Если вы его читаете — клиенты будут получать письма о заказах, а менеджеры смогут писать из CRM."] }),
    );
    return { ok: true, message: `Письмо отправлено на ${staff.user.email} — проверьте ящик (и папку «Спам»)` };
  } catch (err) {
    return { ok: false, message: smtpError(err, config.host, config.port) };
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
  if (id) await container().workspace.templates.update(id, { title, text });
  else await container().workspace.templates.add({ title, text });
  revalidatePath("/admin/settings");
  return { ok: "Сохранено" };
}

export async function deleteTemplateAction(id: string) {
  await assertStaff("settings.manage");
  await container().workspace.templates.delete(z.string().uuid().parse(id));
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
