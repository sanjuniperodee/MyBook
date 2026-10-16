import type { StageMilestone } from "@/shared/domain/stageMilestones";

/** Клиенты сайта глазами продаж (антикоррупционный слой над учётными записями и заказами). */
export interface ClientDirectory {
  /** Клиент по телефону: из профиля (включая доп. номера) или из контактов его заказов. */
  findByPhone(phone: string | null | undefined): Promise<string | null>;
  profile(clientId: string): Promise<{ name: string; email: string; phone: string | null; managerId: string | null; utm: Record<string, string> | null } | null>;
  /** Ответственный сделки становится ответственным клиента, если у клиента его ещё нет. */
  adoptManager(clientId: string, managerId: string): Promise<void>;
}

export interface SalesSettings {
  /** Заявки с новых номеров попадают в «Неразобранное». */
  unsortedEnabled(): Promise<boolean>;
  /** С какого действия на сайте заводить сделку автоматически. */
  autoDealFrom(): Promise<StageMilestone | "off">;
  /** Через сколько минут не взятая заявка переходит следующему по кругу; 0 — не передавать. */
  reassignMinutes(): Promise<number>;
}

/** Распределение заявок между менеджерами (круг). */
export interface StaffRouter {
  /** Рабочее время отдела продаж: вне его заявки не раздаются (утром их раздаст проход планировщика). */
  isWorkTime(): Promise<boolean>;
  /** Раздача — по одной: блокировка до конца транзакции, одновременные заявки расходятся по разным менеджерам. */
  lock(): Promise<void>;
  /**
   * Следующий в круге, кроме exclude: активный сотрудник на смене с правом deals.edit, не руководитель;
   * меньше всего назначений за сегодня, при равенстве — кому дольше не назначали. null — некому.
   */
  next(exclude: readonly string[]): Promise<string | null>;
  /** Сотрудник ещё работает (не отключён) — постоянный клиент идёт к своему ответственному. */
  isActive(userId: string): Promise<boolean>;
}

/** Прогресс книги клиента (контекст Authoring): тема (вид книги), ответы, всего вопросов и слова — для progressOf. */
export interface BookProgress {
  progress(bookId: string): Promise<{ theme: string; answered: number; total: number; words: number } | null>;
}
