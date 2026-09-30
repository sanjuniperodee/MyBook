import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { site } from "@/config/site";
import { localizePath, type Locale } from "@/i18n/config";
import { env } from "./env";

let transporter: Transporter | null | undefined;

function getTransporter() {
  if (transporter !== undefined) return transporter;
  if (!process.env.SMTP_HOST) {
    transporter = null;
    return null;
  }
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  });
  return transporter;
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

export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export async function sendMail(to: string, subject: string, html: string, attachments?: MailAttachment[]) {
  const t = getTransporter();
  if (!t) {
    console.log(`[mail] SMTP не настроен. Письмо для ${to}: «${subject}»${attachments?.length ? ` (+${attachments.length} влож.)` : ""}\n${html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 800)}`);
    return;
  }
  try {
    await t.sendMail({ from: process.env.MAIL_FROM || `${site.name} <${site.contacts.email}>`, to, subject, html, attachments });
  } catch (err) {
    // Почта не должна ломать основной сценарий (оформление заказа и т.п.).
    console.error("[mail] send failed", err);
  }
}

export { escape as escapeHtml };
