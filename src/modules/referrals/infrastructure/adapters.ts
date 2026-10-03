import "server-only";
import { randomBytes } from "node:crypto";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import type { Mailer } from "@/shared/application";
import { appLink, emailLayout, escapeHtml } from "@/shared/infrastructure/mail";
import type { ReferralMail, SuffixGenerator } from "../application";

/** Четыре символа без похожих (0/O, 1/I) — код легко продиктовать. */
export const randomSuffix: SuffixGenerator = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(randomBytes(4), (b) => alphabet[b % alphabet.length]).join("");
};

/** Ссылка-приглашение: по ней друг попадает на сайт, а скидка подставится при оформлении. */
export const inviteUrl = (code: string, locale: Locale = "ru") => appLink(`/r/${encodeURIComponent(code)}`, locale);

export const referralMail = (mailer: Mailer): ReferralMail => ({
  async rewarded(to, { code, percent, validDays, friendName }) {
    const m = messagesFor(to.locale).mail.referral;
    await mailer.send(
      to.email,
      m.subject,
      emailLayout({
        locale: to.locale,
        title: m.title(friendName),
        paragraphs: [m.text(escapeHtml(friendName), percent), m.code(escapeHtml(code)), m.valid(validDays), m.more],
        button: { label: m.button, url: appLink("/invite", to.locale) },
      }),
    );
  },
});
