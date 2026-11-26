import { env } from "@/config/env";
import { GoogleForm } from "../google/GoogleForm";
import { parseWorkHours } from "@/shared/domain/schedule";
import { templateVars } from "@/shared/domain/templates";
import { formatPhone } from "@/shared/domain/phone";
import { staffLabel } from "@/shared/domain/staff";
import { formatDate } from "@/lib/dates";
import { Note, Section } from "../ui";
import { SettingsFrame } from "../frame";
import { tabAnchors } from "../tabs";
import { CrmSettingsForm } from "../crm/CrmSettingsForm";
import { Blocklist } from "../crm/Blocklist";
import { TemplateEditor } from "../crm/TemplateEditor";
import { HolidaysForm } from "../crm/HolidaysForm";
import { DEFAULT_HOLIDAYS, HOLIDAYS_MAX, parseHolidays } from "@/modules/automation/domain";
import { crmRead } from "@/web/crm";

export async function CrmTab() {
  const { sla, templates, workHours, autoDealFrom, unsorted, maxDiscount, blocked, wEnabled, wChat, reassign, holidays, mergeDays, digest, chatReward, wHelp, helpStats, autoLetters, google } = await crmRead("settings.crm", {});
  return (
    <SettingsFrame anchors={tabAnchors("crm")}>
      <CrmSettingsForm slaMinutes={Number(sla) || 15} reassignMinutes={reassign === "" ? 15 : Number(reassign) || 0} workHours={parseWorkHours(workHours)} autoDealFrom={autoDealFrom} unsorted={unsorted !== "off"} maxDiscount={Number(maxDiscount) || 0} mergeClosedDays={mergeDays} widget={{ enabled: wEnabled !== "off", chat: wChat !== "off", help: wHelp !== "off", helpStats }} digest={digest !== "off"} autoLetters={autoLetters !== "off"} chatReward={chatReward === "on"} />

      <Blocklist
        items={blocked.map((b) => ({
          value: b.value,
          label: /^\d{10,15}$/.test(b.value) ? formatPhone(b.value) : b.value,
          date: formatDate(b.createdAt),
          reason: b.reason,
          note: b.note,
          by: b.byEmail ? staffLabel({ name: b.byName ?? "", email: b.byEmail }) : null,
        }))}
      />

      <GoogleForm clientId={google.clientId} clientIdEnv={google.clientIdEnv} secret={google.secret} secretEnv={google.secretEnv} redirectUri={`${env.appUrl}/api/integrations/google/callback`} origin={env.appUrl} connected={google.connected} />

      <HolidaysForm holidays={parseHolidays(holidays)} defaults={[...DEFAULT_HOLIDAYS]} max={HOLIDAYS_MAX} />

      <Section id="templates" title="Шаблоны быстрых ответов" defaultOpen={false} description="Вставляются в чат одной кнопкой" status={templates.length ? { tone: "ok", label: String(templates.length) } : { tone: "off", label: "нет шаблонов" }}>
        <Note className="mb-4">Переменные: {templateVars.join(", ")}.</Note>
        <div className="max-w-[40rem] space-y-3">
          {templates.map((t) => (
            <TemplateEditor key={t.id} template={{ id: t.id, title: t.title, text: t.text }} />
          ))}
          <TemplateEditor template={null} />
        </div>
      </Section>
    </SettingsFrame>
  );
}
