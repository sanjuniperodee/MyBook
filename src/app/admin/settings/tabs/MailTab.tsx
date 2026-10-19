import { fromEnv, getSettings, maskSecret, smtpConfig, smtpFromEnvironment } from "@/modules/workspace";
import { container } from "@/server/container";
import { EmailForm } from "../mail/EmailForm";
import { SmtpForm } from "../mail/SmtpForm";
import { hook } from "./shared";

export async function MailTab({ staffEmail }: { staffEmail: string }) {
  const em = await getSettings(["email.imapHost", "email.imapPort", "email.imapUser", "email.imapPassword", "email.imapMailbox", "email.webhookToken"]);
  const smtpEnv = smtpFromEnvironment();
  const smtpCfg = smtpEnv ? await smtpConfig() : null;
  const smtpDb = await getSettings(["mail.smtpHost", "mail.smtpPort", "mail.smtpSecure", "mail.smtpUser", "mail.smtpPassword", "mail.from", "mail.replyTo"]);
  const smtpSaved = smtpCfg
    ? { host: smtpCfg.host, port: String(smtpCfg.port), secure: String(smtpCfg.secure), user: smtpCfg.user, password: maskSecret(smtpCfg.password), from: smtpCfg.from, replyTo: smtpCfg.replyTo }
    : { host: smtpDb["mail.smtpHost"], port: smtpDb["mail.smtpPort"], secure: smtpDb["mail.smtpSecure"], user: smtpDb["mail.smtpUser"], password: maskSecret(smtpDb["mail.smtpPassword"]), from: smtpDb["mail.from"], replyTo: smtpDb["mail.replyTo"] };
  return (
    <>
      <SmtpForm saved={smtpSaved} fromEnv={smtpEnv} staffEmail={staffEmail} />
      <EmailForm
        smtp={await container().mailer.configured()}
        saved={{ imapHost: em["email.imapHost"], imapPort: em["email.imapPort"], imapUser: em["email.imapUser"], imapPassword: maskSecret(em["email.imapPassword"]), imapMailbox: em["email.imapMailbox"] }}
        env={{ imapHost: fromEnv("email.imapHost"), imapPort: fromEnv("email.imapPort"), imapUser: fromEnv("email.imapUser"), imapPassword: fromEnv("email.imapPassword") }}
        webhookUrl={em["email.webhookToken"] ? hook("/api/integrations/email", em["email.webhookToken"]) : null}
      />
    </>
  );
}
