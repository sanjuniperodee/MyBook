import "server-only";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { messagesFor } from "@/i18n/messages";
import { env } from "@/lib/env";
import { appLink, emailLayout, escapeHtml, sendMail } from "@/lib/mail";
import { decryptSecret, encryptSecret } from "@/shared/crypto";
import type { AdminEmailsPolicy, PasswordHasher, PasswordResetMailer, SecretCipher, TokenService } from "../application/ports";

export const bcryptHasher: PasswordHasher = {
  hash: (password) => bcrypt.hash(password, 12),
  verify: (password, hash) => bcrypt.compare(password, hash),
};

/** Совместимо с уже выданными сессиями: base64url(32 байта), в базе — sha256 hex. */
export const randomTokens: TokenService = {
  newToken: () => randomBytes(32).toString("base64url"),
  hash: (token) => createHash("sha256").update(token).digest("hex"),
};

export const appSecretCipher: SecretCipher = { encrypt: encryptSecret, decrypt: decryptSecret };

export const envAdminEmails: AdminEmailsPolicy = { isAdminEmail: (email) => env.adminEmails.includes(email.toLowerCase()) };

/** Письмо со ссылкой сброса — на языке страницы, с которой запросили восстановление. */
export const resetMailer: PasswordResetMailer = {
  async send({ email, name, token, locale }) {
    const t = messagesFor(locale).mail;
    await sendMail(
      email,
      t.reset.subject,
      emailLayout({ locale, title: t.reset.title, paragraphs: [t.hello(escapeHtml(name)), t.reset.text], button: { label: t.reset.button, url: appLink(`/reset/${token}`, locale) }, footnote: t.reset.footnote }),
    );
  },
};
