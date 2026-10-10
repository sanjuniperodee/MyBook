import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { site } from "@/config/site";
import { localizePath, type Locale } from "@/i18n/config";
import { env } from "@/config/env";
import type { MailAttachment, Mailer } from "../application/Mailer";

/** Настройки SMTP (из админки или переменных окружения); null — не настроено. */
export interface SmtpConfig {
  host: string;
  port: number;
  /** TLS сразу (465); иначе STARTTLS, если сервер его предлагает. */
  secure: boolean;
  user: string;
  password: string;
  /** «MyBooks <hello@mybook.kz>» */
  from: string;
  replyTo: string;
}

export type SmtpConfigSource = () => Promise<SmtpConfig | null>;

/** Настройки только из переменных окружения — для скриптов и тестов без базы. */
export const smtpFromEnv: SmtpConfigSource = async () => {
  if (!process.env.SMTP_HOST) return null;
  const port = Number(process.env.SMTP_PORT ?? 587);
  return {
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
    user: process.env.SMTP_USER ?? "",
    password: process.env.SMTP_PASSWORD ?? "",
    from: process.env.MAIL_FROM || defaultFrom(),
    replyTo: process.env.CRM_REPLY_TO ?? "",
  };
};

export const defaultFrom = () => `${site.name} <${site.contacts.email}>`;

function createTransport(c: SmtpConfig): Transporter {
  return nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.secure,
    auth: c.user ? { user: c.user, pass: c.password } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 60_000,
  });
}

function escape(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/** Абсолютная ссылка на страницу сайта на языке получателя (для писем). */
export function appLink(path: string, locale: Locale = "ru") {
  return `${env.appUrl}${localizePath(path, locale)}`;
}

/** Простой брендированный HTML-шаблон письма. */
export function emailLayout(opts: { title: string; paragraphs: string[]; button?: { label: string; url: string }; footnote?: string; locale?: Locale }) {
  const body = opts.paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#3b332e">${p}</p>`).join("");
  const button = opts.button
    ? `<p style="margin:24px 0"><a href="${opts.button.url}" style="display:inline-block;background:#7a1f2b;color:#fff;text-decoration:none;padding:13px 26px;border-radius:999px;font-size:15px;font-weight:600">${escape(opts.button.label)}</a></p>`
    : "";
  return `<!doctype html><html lang="${opts.locale ?? "ru"}"><body style="margin:0;background:#faf7f2;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#faf7f2;padding:32px 12px"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:20px;border:1px solid #e8e0d5">
<tr><td style="padding:32px 36px 8px"><div style="font-family:Georgia,serif;font-size:24px;color:#7a1f2b">${site.name}</div></td></tr>
<tr><td style="padding:12px 36px 32px"><h1 style="margin:0 0 18px;font-family:Georgia,serif;font-weight:normal;font-size:26px;color:#1e1916">${escape(opts.title)}</h1>${body}${button}
${opts.footnote ? `<p style="margin:20px 0 0;font-size:13px;color:#7a7068">${opts.footnote}</p>` : ""}</td></tr>
</table>
<p style="font-size:12px;color:#7a7068;margin:18px 0 0">${site.name} · <a href="${env.appUrl}" style="color:#7a7068">${env.appUrl.replace(/^https?:\/\//, "")}</a> · ${site.contacts.email}</p>
</td></tr></table></body></html>`;
}

export { escape as escapeHtml };

/**
 * Почта по SMTP. Настройки читаются при каждой отправке (их меняют в «Интеграциях» без перезапуска),
 * транспорт пересоздаётся только когда они изменились. Без настроек письма пишутся в лог.
 */
export class SmtpMailer implements Mailer {
  #cached: { sig: string; transport: Transporter } | null = null;

  constructor(private readonly config: SmtpConfigSource) {}

  /** Общий HTML-шаблон писем. */
  readonly layout = emailLayout;

  async configured() {
    return !!(await this.config());
  }

  /** Транспорт и адрес отправителя для писем менеджеров из CRM (нужны Message-ID и цепочки); null — SMTP не настроен. */
  async transport(): Promise<{ transport: Transporter; config: SmtpConfig } | null> {
    const c = await this.config();
    if (!c) return null;
    const sig = JSON.stringify([c.host, c.port, c.secure, c.user, c.password]);
    if (this.#cached?.sig !== sig) {
      this.#cached?.transport.close();
      this.#cached = { sig, transport: createTransport(c) };
    }
    return { transport: this.#cached.transport, config: c };
  }

  /** Проверка подключения и входа на SMTP-сервер — для кнопки «Проверить» в настройках. */
  async verify(c: SmtpConfig) {
    const t = createTransport(c);
    try {
      await t.verify();
    } finally {
      t.close();
    }
  }

  /** Отправка с ошибкой наружу (а не в лог) — для тестового письма из настроек. */
  async sendOrThrow(to: string, subject: string, html: string) {
    const t = await this.transport();
    if (!t) throw Object.assign(new Error("SMTP is not configured"), { code: "ENOCONFIG" });
    await t.transport.sendMail({ from: t.config.from, to, subject, html });
    return t.config;
  }

  async send(to: string, subject: string, html: string, attachments?: MailAttachment[]) {
    // Клиент без почты заведён с адресом-заглушкой (@phone.invalid) — письма ему не уходят и в лог не попадают.
    if (to.trim().toLowerCase().endsWith(".invalid")) return;
    const t = await this.transport().catch((err) => {
      console.error("[mail] settings", err);
      return null;
    });
    if (!t) {
      console.log(`[mail] SMTP не настроен. Письмо для ${to}: «${subject}»${attachments?.length ? ` (+${attachments.length} влож.)` : ""}\n${html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 800)}`);
      return;
    }
    try {
      await t.transport.sendMail({ from: t.config.from, to, subject, html, attachments });
    } catch (err) {
      // Почта не должна ломать основной сценарий (оформление заказа и т.п.).
      console.error("[mail] send failed", err);
    }
  }
}
