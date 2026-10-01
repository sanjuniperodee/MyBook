import { requireStaff } from "@/server/access";
import { fromEnv, getSetting, getSettings, maskSecret, smtpConfig, smtpFromEnvironment } from "@/modules/workspace";
import { container } from "@/server/container";
import { aiProviderIds, aiProviders, isAiProvider, providerSettingKeys, type AiProvider } from "@/modules/assistant";
import { env } from "@/config/env";
import { templateVars } from "@/modules/automation/domain/meta";
import { AiForm, Blocklist, EmailForm, SmtpForm, CrmSettingsForm, TelephonyForm, TemplateEditor, WazzupForm } from "./SettingsForms";
import { parseWorkHours } from "@/modules/workspace/domain/schedule";
import { BotForm } from "./BotForm";
import { parseBotConfig } from "@/modules/messaging/domain/botConfig";
import { listFields } from "@/modules/workspace";
import { formatPhone } from "@/shared/domain/phone";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Интеграции" };

export default async function SettingsPage() {
  const staff = await requireStaff("settings.manage");
  const [apiKey, baseUrl, channelId, webhookToken, provider, zKey, zSecret, pbxToken, sla, templates, workHours, autoDealFrom, unsorted, maxDiscount, blocked] = await Promise.all([
    getSetting("wazzup.apiKey"),
    getSetting("wazzup.baseUrl"),
    getSetting("wazzup.channelId"),
    getSetting("wazzup.webhookToken"),
    getSetting("telephony.provider"),
    getSetting("zadarma.key"),
    getSetting("zadarma.secret"),
    getSetting("pbx.token"),
    getSetting("crm.slaMinutes"),
    container().workspace.templates.list(),
    getSetting("crm.workHours"),
    getSetting("crm.autoDealFrom"),
    getSetting("crm.unsorted"),
    getSetting("crm.maxDiscount"),
    container().messaging.queries.blocklist(),
  ]);
  const [botMode, botConfig, dealFields, stats] = await Promise.all([getSetting("bot.mode"), getSetting("bot.config"), listFields("deal"), container().messaging.queries.botStats()]);
  const [wEnabled, wChat, zPbx, zWebphone] = await Promise.all([getSetting("widget.enabled"), getSetting("widget.chat"), getSetting("zadarma.pbxId"), getSetting("zadarma.webphone")]);
  const em = await getSettings(["email.imapHost", "email.imapPort", "email.imapUser", "email.imapPassword", "email.imapMailbox", "email.webhookToken"]);
  const [aiProvider, aiEnabled, aiKnowledge] = await Promise.all([getSetting("ai.provider"), getSetting("ai.enabled"), getSetting("ai.knowledge")]);
  const aiSaved = Object.fromEntries(
    await Promise.all(
      aiProviderIds.map(async (p) => {
        const k = providerSettingKeys[p];
        const v = await getSettings([k.apiKey, k.model, k.baseUrl]);
        // Адрес Claude по умолчанию хранится в настройках — показываем его как плейсхолдер, а не как своё значение.
        const baseUrl = v[k.baseUrl] === aiProviders[p].defaultBaseUrl ? "" : v[k.baseUrl];
        return [p, { apiKey: maskSecret(v[k.apiKey]), apiKeyEnv: fromEnv(k.apiKey), model: v[k.model], baseUrl, baseUrlEnv: fromEnv(k.baseUrl) }] as const;
      }),
    ),
  ) as Record<AiProvider, { apiKey: string; apiKeyEnv: boolean; model: string; baseUrl: string; baseUrlEnv: boolean }>;
  const smtpEnv = smtpFromEnvironment();
  const smtpCfg = smtpEnv ? await smtpConfig() : null;
  const smtpDb = await getSettings(["mail.smtpHost", "mail.smtpPort", "mail.smtpSecure", "mail.smtpUser", "mail.smtpPassword", "mail.from", "mail.replyTo"]);
  const smtpSaved = smtpCfg
    ? { host: smtpCfg.host, port: String(smtpCfg.port), secure: String(smtpCfg.secure), user: smtpCfg.user, password: maskSecret(smtpCfg.password), from: smtpCfg.from, replyTo: smtpCfg.replyTo }
    : { host: smtpDb["mail.smtpHost"], port: smtpDb["mail.smtpPort"], secure: smtpDb["mail.smtpSecure"], user: smtpDb["mail.smtpUser"], password: maskSecret(smtpDb["mail.smtpPassword"]), from: smtpDb["mail.from"], replyTo: smtpDb["mail.replyTo"] };
  const hook = (path: string, token?: string) => `${env.appUrl}${path}${token ? `?token=${token}` : ""}`;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Интеграции и настройки</h1>
        <p className="mt-1 text-sm text-muted">Ключи хранятся в базе в зашифрованном виде и не показываются целиком. Значения из переменных окружения сервера имеют приоритет и здесь только для чтения.</p>
      </div>

      <WazzupForm
        saved={{ apiKey: maskSecret(apiKey), baseUrl, channelId }}
        env={{ apiKey: fromEnv("wazzup.apiKey"), baseUrl: fromEnv("wazzup.baseUrl"), channelId: fromEnv("wazzup.channelId") }}
        webhookUrl={webhookToken ? hook("/api/integrations/wazzup", webhookToken) : null}
      />

      <TelephonyForm
        provider={provider as "off" | "zadarma" | "pbx"}
        providerFromEnv={fromEnv("telephony.provider")}
        zadarma={{ key: maskSecret(zKey), secret: maskSecret(zSecret), keyEnv: fromEnv("zadarma.key"), secretEnv: fromEnv("zadarma.secret"), pbxId: zPbx, pbxIdEnv: fromEnv("zadarma.pbxId"), webphone: zWebphone === "on" }}
        zadarmaUrl={hook("/api/integrations/zadarma")}
        pbxUrl={pbxToken ? hook("/api/integrations/pbx", pbxToken) : null}
      />

      <SmtpForm
        saved={smtpSaved}
        fromEnv={smtpEnv}
        staffEmail={staff.user.email}
      />

      <EmailForm
        smtp={await container().mailer.configured()}
        saved={{ imapHost: em["email.imapHost"], imapPort: em["email.imapPort"], imapUser: em["email.imapUser"], imapPassword: maskSecret(em["email.imapPassword"]), imapMailbox: em["email.imapMailbox"] }}
        env={{ imapHost: fromEnv("email.imapHost"), imapPort: fromEnv("email.imapPort"), imapUser: fromEnv("email.imapUser"), imapPassword: fromEnv("email.imapPassword") }}
        webhookUrl={em["email.webhookToken"] ? hook("/api/integrations/email", em["email.webhookToken"]) : null}
      />

      <AiForm provider={isAiProvider(aiProvider) ? aiProvider : "anthropic"} providerFromEnv={fromEnv("ai.provider")} providers={aiSaved} enabled={aiEnabled !== "off"} knowledge={aiKnowledge} />

      <CrmSettingsForm slaMinutes={Number(sla) || 15} workHours={parseWorkHours(workHours)} autoDealFrom={autoDealFrom} unsorted={unsorted !== "off"} maxDiscount={Number(maxDiscount) || 0} widget={{ enabled: wEnabled !== "off", chat: wChat !== "off" }} />

      <BotForm mode={botMode} config={parseBotConfig(botConfig)} fields={dealFields.filter((f) => f.type !== "checkbox").map((f) => ({ key: f.key, label: f.label, type: f.type }))} stats={stats} />

      <Blocklist items={blocked.map((b) => ({ value: b.value, label: /^\d{10,15}$/.test(b.value) ? formatPhone(b.value) : b.value, date: formatDate(b.createdAt) }))} />

      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="font-semibold">Шаблоны быстрых ответов</h2>
        <p className="mt-1 mb-4 text-sm text-muted">Вставляются в чат одной кнопкой. Переменные: {templateVars.join(", ")}.</p>
        <div className="space-y-3">
          {templates.map((t) => (
            <TemplateEditor key={t.id} template={{ id: t.id, title: t.title, text: t.text }} />
          ))}
          <TemplateEditor template={null} />
        </div>
      </section>
    </div>
  );
}
