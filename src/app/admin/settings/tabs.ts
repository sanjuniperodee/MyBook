import { Bot, Brain, CreditCard, Headphones, Mail, MessageCircle, Settings2, type LucideIcon } from "lucide-react";

/** Раздел внутри вкладки: id листа (якорь) и подпись в боковой навигации. Состояние (точка) читается с самого листа. */
export interface SettingsAnchor {
  id: string;
  label: string;
}

/** Вкладки страницы «Интеграции»: каждая открывает только свои формы и грузит только свои данные. */
export const SETTINGS_TABS = [
  {
    id: "payments",
    label: "Оплата",
    hint: "Kaspi, перевод",
    icon: CreditCard,
    group: "Деньги",
    sections: [
      { id: "kaspi", label: "Kaspi Pay" },
      { id: "transfer", label: "Оплата переводом" },
    ],
  },
  {
    id: "messengers",
    label: "Мессенджеры",
    hint: "WhatsApp, Wazzup, сообщения правил",
    icon: MessageCircle,
    group: "Каналы связи",
    sections: [
      { id: "gowa", label: "WhatsApp: свой шлюз" },
      { id: "wa-calls", label: "Звонки WhatsApp" },
      { id: "rule-sending", label: "Сообщения от правил" },
      { id: "lifecycle-chat", label: "Автописьма в WhatsApp" },
      { id: "wazzup", label: "Wazzup" },
    ],
  },
  {
    id: "mail",
    label: "Почта",
    hint: "Письма клиентам и входящие",
    icon: Mail,
    group: "Каналы связи",
    sections: [
      { id: "smtp", label: "Отправка (SMTP)" },
      { id: "imap", label: "Входящие (IMAP)" },
    ],
  },
  { id: "telephony", label: "Телефония", hint: "Zadarma, АТС", icon: Headphones, group: "Каналы связи", sections: [{ id: "telephony", label: "Телефония" }] },
  {
    id: "ai",
    label: "AI",
    hint: "Помощник, корректор, продажник",
    icon: Brain,
    group: "Автоматизация",
    sections: [
      { id: "ai-map", label: "Что где настраивается" },
      { id: "ai-assistant", label: "Помощник менеджеров" },
      { id: "ai-routing", label: "Маршрутизация продажника" },
      { id: "ai-seller", label: "Прежняя модель продажника" },
      { id: "ai-media", label: "Голосовые и фото" },
      { id: "ai-proofread", label: "Корректор у клиента" },
      { id: "ai-writer", label: "Помощник при письме" },
    ],
  },
  { id: "bot", label: "Бот", hint: "Автоответчик и продажник", icon: Bot, group: "Автоматизация", sections: [] },
  {
    id: "crm",
    label: "CRM",
    hint: "График, правила, праздники, шаблоны, спам",
    icon: Settings2,
    group: "Работа менеджеров",
    sections: [
      { id: "crm-sales", label: "Отдел продаж" },
      { id: "blocklist", label: "Стоп-лист" },
      { id: "holidays", label: "Праздники" },
      { id: "templates", label: "Шаблоны ответов" },
    ],
  },
] as const satisfies readonly { id: string; label: string; hint: string; icon: LucideIcon; group: string; sections: readonly SettingsAnchor[] }[];

export type SettingsTabId = (typeof SETTINGS_TABS)[number]["id"];

/** Якоря вкладки для боковой навигации. */
export const tabAnchors = (id: SettingsTabId): readonly SettingsAnchor[] => SETTINGS_TABS.find((t) => t.id === id)?.sections ?? [];

/** Вкладка из адреса; незнакомая или пустая — первая. */
export const parseTab = (v: string | string[] | undefined): SettingsTabId => {
  const id = Array.isArray(v) ? v[0] : v;
  return SETTINGS_TABS.find((t) => t.id === id)?.id ?? SETTINGS_TABS[0].id;
};
