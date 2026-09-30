import { asc, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { crmBlocklist, crmTemplates } from "@/lib/db/schema";
import { requireStaff } from "@/lib/crm/rbac";
import { fromEnv, getSetting, maskSecret } from "@/lib/crm/settings";
import { env } from "@/lib/env";
import { templateVars } from "@/lib/crm/automation-meta";
import { Blocklist, CrmSettingsForm, TelephonyForm, TemplateEditor, WazzupForm } from "./SettingsForms";
import { parseWorkHours } from "@/lib/crm/schedule";
import { formatPhone } from "@/lib/crm/phone";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Интеграции" };

export default async function SettingsPage() {
  await requireStaff("settings.manage");
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
    db.select().from(crmTemplates).orderBy(asc(crmTemplates.position), asc(crmTemplates.createdAt)),
    getSetting("crm.workHours"),
    getSetting("crm.autoDealFrom"),
    getSetting("crm.unsorted"),
    getSetting("crm.maxDiscount"),
    db.select().from(crmBlocklist).orderBy(desc(crmBlocklist.createdAt)).limit(200),
  ]);
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
        zadarma={{ key: maskSecret(zKey), secret: maskSecret(zSecret), keyEnv: fromEnv("zadarma.key"), secretEnv: fromEnv("zadarma.secret") }}
        zadarmaUrl={hook("/api/integrations/zadarma")}
        pbxUrl={pbxToken ? hook("/api/integrations/pbx", pbxToken) : null}
      />

      <CrmSettingsForm slaMinutes={Number(sla) || 15} workHours={parseWorkHours(workHours)} autoDealFrom={autoDealFrom} unsorted={unsorted !== "off"} maxDiscount={Number(maxDiscount) || 0} />

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
