import type { StageMilestone } from "../domain";

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
}

/** Распределение новых заявок между менеджерами. */
export interface StaffRouter {
  /** Следующий менеджер по кругу (на смене, в рабочее время) или null. */
  nextRoundRobin(): Promise<string | null>;
}

/** Прогресс книги клиента (контекст Authoring). */
export interface BookProgress {
  progress(bookId: string): Promise<{ answered: number; total: number } | null>;
}
