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

export const lostReasons = ["Дорого", "Передумал", "Не успеваем к дате", "Выбрал другой подарок", "Не отвечает", "Спам / ошибка"];
