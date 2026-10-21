/** Справочники сделок без серверных зависимостей — для интерфейса и сервера. */
import { STAGE_MILESTONES, type StageMilestone } from "@/shared/domain/stageMilestones";

/** События на сайте, по которым сделка сама идёт по воронке: подписи для настройки этапов. */
export const stageMilestones: Record<StageMilestone, string> = {
  registered: "Клиент зарегистрировался",
  book_started: "Клиент начал книгу",
  // Подписи нейтральны к виду книги: у своей книги вехи считаются по словам (lib/content/kinds, progressOf).
  book_half: "Написал половину книги",
  book_ready: "Книга почти готова",
  order_created: "Оформил заказ",
  order_paid: "Оплатил заказ",
};
export const milestoneOrder: readonly StageMilestone[] = STAGE_MILESTONES;

/** Откуда приходит заявка → группа настройки «куда падает новая заявка»: подписи для воронки и разбор в продажах. */
export const entryGroups = {
  messenger: "Сообщение клиента (WhatsApp, Instagram, Telegram, почта)",
  call: "Звонок с нового номера",
  site: "Заявка с сайта («Перезвоните мне»)",
  repeat: "Повторная продажа (автоматизация)",
} as const;
export type EntryGroup = keyof typeof entryGroups;

export function entryGroup(source: string): EntryGroup | null {
  if (source === "whatsapp" || source === "instagram" || source === "telegram" || source === "email") return "messenger";
  if (source === "call") return "call";
  if (source === "site") return "site";
  if (source === "repeat") return "repeat";
  return null;
}

export const lostReasons = ["Дорого", "Передумал", "Не успеваем к дате", "Выбрал другой подарок", "Не отвечает", "Спам / ошибка"];
