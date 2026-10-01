import "server-only";
import { defaultFrom, smtpFromEnv, type SmtpConfig } from "@/shared/infrastructure/mail";
import { getSettings } from "./settings";

/** Почта задана переменными окружения сервера (SMTP_HOST и др.) — тогда в админке она только для чтения. */
export const smtpFromEnvironment = () => !!process.env.SMTP_HOST;

/** Настройки SMTP: из переменных SMTP_* (если задан SMTP_HOST), иначе из «Интеграций»; null — сервер не указан. */
export async function smtpConfig(): Promise<SmtpConfig | null> {
  if (smtpFromEnvironment()) return smtpFromEnv();
  const v = await getSettings(["mail.smtpHost", "mail.smtpPort", "mail.smtpSecure", "mail.smtpUser", "mail.smtpPassword", "mail.from", "mail.replyTo"]);
  if (!v["mail.smtpHost"]) return null;
  const port = Number(v["mail.smtpPort"]) || 587;
  return {
    host: v["mail.smtpHost"],
    port,
    secure: v["mail.smtpSecure"] ? v["mail.smtpSecure"] === "true" : port === 465,
    user: v["mail.smtpUser"],
    password: v["mail.smtpPassword"],
    from: v["mail.from"] || defaultFrom(),
    replyTo: v["mail.replyTo"],
  };
}
