import { EmailForm } from "../mail/EmailForm";
import { SmtpForm } from "../mail/SmtpForm";
import { SettingsFrame } from "../frame";
import { tabAnchors } from "../tabs";
import { hook } from "./shared";
import { crmRead } from "@/server/v1-local-bridge-crm";

export async function MailTab({ staffEmail }: { staffEmail: string }) {
  const { smtpEnv, smtpSaved, smtp, imap, imapEnv, webhookToken } = await crmRead("settings.mail", {});
  return (
    <SettingsFrame anchors={tabAnchors("mail")}>
      <SmtpForm saved={smtpSaved} fromEnv={smtpEnv} staffEmail={staffEmail} />
      <EmailForm
        smtp={smtp}
        saved={imap}
        env={imapEnv}
        webhookUrl={webhookToken ? hook("/api/integrations/email", webhookToken) : null}
      />
    </SettingsFrame>
  );
}
