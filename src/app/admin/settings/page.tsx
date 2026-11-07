import { requireStaff } from "@/server/access";
import { PageHeader } from "@/components/admin/PageHeader";
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
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader title="Интеграции и настройки">Ключи хранятся в базе в зашифрованном виде и не показываются целиком. Значения из переменных окружения сервера имеют приоритет и здесь только для чтения.</PageHeader>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8">
        <SettingsNav active={tab} />
        <div className="min-w-0 space-y-4" data-testid={`settings-tab-${tab}`}>
          <header className="flex items-center gap-3 pb-1">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-rose/60 text-wine">
              <current.icon className="size-[18px]" strokeWidth={1.8} aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg leading-tight font-semibold">{current.label}</h2>
              <p className="truncate text-xs text-muted">{current.hint}</p>
            </div>
          </header>
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
