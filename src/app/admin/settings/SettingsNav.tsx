import { Tabs } from "@/components/admin/Tabs";
import { ScrollActive } from "./ScrollActive";
import { SETTINGS_TABS, type SettingsTabId } from "./tabs";

/**
 * Вкладки страницы «Интеграции»: подчёркнутая активная, лента листается вбок на телефоне. Это ссылки (?tab=…), поэтому
 * вкладку можно открыть напрямую, вернуться назад и отправить коллеге адрес. Разделы внутри вкладки — якоря слева (SheetRail).
 */
export function SettingsNav({ active }: { active: SettingsTabId }) {
  return (
    <ScrollActive>
      <Tabs label="Разделы интеграций" items={SETTINGS_TABS.map((t) => ({ key: t.id, label: t.label, href: `/admin/settings?tab=${t.id}`, active: t.id === active }))} />
    </ScrollActive>
  );
}
