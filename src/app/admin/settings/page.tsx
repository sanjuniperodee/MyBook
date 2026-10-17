import { requireStaff } from "@/server/access";
import { BOT_FORM_TABS } from "./crm/botTabs";
import { SettingsNav } from "./SettingsNav";
import { SETTINGS_TABS, parseTab } from "./tabs";
import { AiTab } from "./tabs/AiTab";
import { BotTab } from "./tabs/BotTab";
import { CrmTab } from "./tabs/CrmTab";
import { MailTab } from "./tabs/MailTab";
import { MessengersTab } from "./tabs/MessengersTab";
import { PaymentsTab } from "./tabs/PaymentsTab";
import { TelephonyTab } from "./tabs/TelephonyTab";

export const metadata = { title: "Интеграции" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[]; section?: string | string[] }> }) {
  const staff = await requireStaff("settings.manage");
  const params = await searchParams;
  const tab = parseTab(params.tab);
  const section = [params.section].flat()[0];
  const current = SETTINGS_TABS.find((t) => t.id === tab)!;
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Интеграции и настройки</h1>
        <p className="mt-1 text-sm text-muted">Ключи хранятся в базе в зашифрованном виде и не показываются целиком. Значения из переменных окружения сервера имеют приоритет и здесь только для чтения.</p>
      </div>
      <div className="grid gap-6 md:grid-cols-[14rem_minmax(0,1fr)]">
        <SettingsNav active={tab} />
        <div className="min-w-0 space-y-6" data-testid={`settings-tab-${tab}`}>
          <h2 className="sr-only">{current.label}</h2>
          {tab === "payments" ? <PaymentsTab /> : null}
          {tab === "messengers" ? <MessengersTab /> : null}
          {tab === "mail" ? <MailTab staffEmail={staff.user.email} /> : null}
          {tab === "telephony" ? <TelephonyTab /> : null}
          {tab === "ai" ? <AiTab /> : null}
          {tab === "bot" ? <BotTab section={BOT_FORM_TABS.find((t) => t === section)} /> : null}
          {tab === "crm" ? <CrmTab /> : null}
        </div>
      </div>
    </div>
  );
}
