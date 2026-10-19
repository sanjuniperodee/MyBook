"use server";

import { container } from "@/server/container";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertStaff, audit } from "@/server/access";
import { ensureToken, getSettings, saveSettings, smtpConfig, smtpFromEnvironment } from "@/modules/workspace";
import type { SettingsState } from "../state";
import { secretValue, unlessEnv } from "../form-kit";

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
      ...unlessEnv("email.imapHost", d.imapHost),
      ...unlessEnv("email.imapPort", String(d.imapPort)),
      ...unlessEnv("email.imapUser", d.imapUser),
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
    return { ok: true, message: await container().messaging.email.testImap() };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Не удалось подключиться" };
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
