/** Источник сделки — общий справочник без серверных зависимостей: продажи, правила автоматизаций, AI-помощник, схема БД и интерфейс. */
export const dealSources = ["site", "whatsapp", "instagram", "telegram", "call", "email", "gift", "referral", "repeat", "manual"] as const;
export type DealSource = (typeof dealSources)[number];

export const dealSourceLabels: Record<DealSource, string> = {
  site: "Сайт",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  telegram: "Telegram",
  call: "Звонок",
  email: "E-mail",
  gift: "Сертификат",
  referral: "Рекомендация",
  repeat: "Повторная продажа",
  manual: "Вручную",
};
