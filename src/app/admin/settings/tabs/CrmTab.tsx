import { container } from "@/server/container";
import { getSetting } from "@/modules/workspace";
import { parseWorkHours } from "@/shared/domain/schedule";
import { templateVars } from "@/shared/domain/templates";
import { formatPhone } from "@/shared/domain/phone";
import { staffLabel } from "@/shared/domain/staff";
import { formatDate } from "@/lib/dates";
import { Intro } from "@/components/admin/Intro";
import { Section, Status } from "../ui";
import { CrmSettingsForm } from "../crm/CrmSettingsForm";
import { Blocklist } from "../crm/Blocklist";
import { TemplateEditor } from "../crm/TemplateEditor";
import { HolidaysForm } from "../crm/HolidaysForm";
import { DEFAULT_HOLIDAYS, HOLIDAYS_MAX, parseHolidays } from "@/modules/automation/domain";

export async function CrmTab() {
  const [sla, templates, workHours, autoDealFrom, unsorted, maxDiscount, blocked, wEnabled, wChat, reassign, holidays, mergeDays] = await Promise.all([
    getSetting("crm.slaMinutes"),
    container().workspace.templates.list(),
    getSetting("crm.workHours"),
    getSetting("crm.autoDealFrom"),
    getSetting("crm.unsorted"),
    getSetting("crm.maxDiscount"),
    container().messaging.queries.blocklist(),
    getSetting("widget.enabled"),
    getSetting("widget.chat"),
    getSetting("crm.reassignMinutes"),
    getSetting("automation.holidays"),
    container().sales.deals.mergeClosedDays(),
  ]);
  return (
    <>
      <CrmSettingsForm slaMinutes={Number(sla) || 15} reassignMinutes={reassign === "" ? 15 : Number(reassign) || 0} workHours={parseWorkHours(workHours)} autoDealFrom={autoDealFrom} unsorted={unsorted !== "off"} maxDiscount={Number(maxDiscount) || 0} mergeClosedDays={mergeDays} widget={{ enabled: wEnabled !== "off", chat: wChat !== "off" }} />

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

      <HolidaysForm holidays={parseHolidays(holidays)} defaults={[...DEFAULT_HOLIDAYS]} max={HOLIDAYS_MAX} />

      <Section title="Шаблоны быстрых ответов" defaultOpen={false} badge={<Status on={templates.length > 0} label={String(templates.length)} />}>
        <Intro className="mb-4">Вставляются в чат одной кнопкой. Переменные: {templateVars.join(", ")}.</Intro>
        <div className="space-y-3">
          {templates.map((t) => (
            <TemplateEditor key={t.id} template={{ id: t.id, title: t.title, text: t.text }} />
          ))}
          <TemplateEditor template={null} />
        </div>
      </Section>
    </>
  );
}
