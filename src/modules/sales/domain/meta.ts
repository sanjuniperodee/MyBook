/** Справочники сделок без серверных зависимостей — для интерфейса и сервера. */
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

/** События на сайте, по которым сделка сама идёт по воронке. */
export const stageMilestones = {
  registered: "Клиент зарегистрировался",
  book_started: "Клиент начал книгу",
  book_half: "Ответил на половину вопросов",
  book_ready: "Книга почти готова (25+ ответов)",
  order_created: "Оформил заказ",
  order_paid: "Оплатил заказ",
} as const;
export type StageMilestone = keyof typeof stageMilestones;
export const milestoneOrder: StageMilestone[] = ["registered", "book_started", "book_half", "book_ready", "order_created", "order_paid"];
/** Столько ответов — «книга почти готова» (совпадает с автописьмом lifecycle). */
export const BOOK_READY_ANSWERS = 25;

export const lostReasons = ["Дорого", "Передумал", "Не успеваем к дате", "Выбрал другой подарок", "Не отвечает", "Спам / ошибка"];
