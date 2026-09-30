/** Справочники сделок без серверных зависимостей — для интерфейса и сервера. */
export const dealSources = ["site", "whatsapp", "instagram", "telegram", "call", "gift", "referral", "manual"] as const;
export type DealSource = (typeof dealSources)[number];

export const dealSourceLabels: Record<DealSource, string> = {
  site: "Сайт",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  telegram: "Telegram",
  call: "Звонок",
  gift: "Сертификат",
  referral: "Рекомендация",
  manual: "Вручную",
};

export const lostReasons = ["Дорого", "Передумал", "Не успеваем к дате", "Выбрал другой подарок", "Не отвечает", "Спам / ошибка"];
