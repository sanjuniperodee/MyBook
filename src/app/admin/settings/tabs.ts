import { Bot, Brain, CreditCard, Headphones, Mail, MessageCircle, Settings2, type LucideIcon } from "lucide-react";

/** Вкладки страницы «Интеграции»: каждая открывает только свои формы и грузит только свои данные. */
export const SETTINGS_TABS = [
  { id: "payments", label: "Оплата", hint: "Kaspi, перевод", icon: CreditCard, group: "Деньги" },
  { id: "messengers", label: "Мессенджеры", hint: "WhatsApp, Wazzup", icon: MessageCircle, group: "Каналы связи" },
  { id: "mail", label: "Почта", hint: "Письма клиентам и входящие", icon: Mail, group: "Каналы связи" },
  { id: "telephony", label: "Телефония", hint: "Zadarma, АТС", icon: Headphones, group: "Каналы связи" },
  { id: "ai", label: "AI", hint: "Помощник, корректор, продажник", icon: Brain, group: "Автоматизация" },
  { id: "bot", label: "Бот", hint: "Автоответчик и продажник", icon: Bot, group: "Автоматизация" },
  { id: "crm", label: "CRM", hint: "График, правила, шаблоны, спам", icon: Settings2, group: "Работа менеджеров" },
] as const satisfies readonly { id: string; label: string; hint: string; icon: LucideIcon; group: string }[];

export type SettingsTabId = (typeof SETTINGS_TABS)[number]["id"];

/** Вкладка из адреса; незнакомая или пустая — первая. */
export const parseTab = (v: string | string[] | undefined): SettingsTabId => {
  const id = Array.isArray(v) ? v[0] : v;
  return SETTINGS_TABS.find((t) => t.id === id)?.id ?? SETTINGS_TABS[0].id;
};
