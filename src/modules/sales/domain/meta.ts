/** Справочники сделок без серверных зависимостей — для интерфейса и сервера. */
import { STAGE_MILESTONES, type StageMilestone } from "@/shared/domain/stageMilestones";

/** События на сайте, по которым сделка сама идёт по воронке: подписи для настройки этапов. */
export const stageMilestones: Record<StageMilestone, string> = {
  registered: "Клиент зарегистрировался",
  book_started: "Клиент начал книгу",
  book_half: "Ответил на половину вопросов",
  book_ready: "Книга почти готова (25+ ответов)",
  order_created: "Оформил заказ",
  order_paid: "Оплатил заказ",
};
export const milestoneOrder: readonly StageMilestone[] = STAGE_MILESTONES;
/** Столько ответов — «книга почти готова» (совпадает с автописьмом lifecycle). */
export const BOOK_READY_ANSWERS = 25;

export const lostReasons = ["Дорого", "Передумал", "Не успеваем к дате", "Выбрал другой подарок", "Не отвечает", "Спам / ошибка"];
