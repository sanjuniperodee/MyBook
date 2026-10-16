/** Уведомление сотруднику CRM: колокольчик, открытые вкладки и push на устройства. */
export interface StaffNotification {
  kind: "message" | "call" | "task" | "deal" | "sla" | "system" | "mention";
  title: string;
  body?: string;
  link?: string | null;
}

/**
 * Уведомления сотрудникам (реализация — modules/workspace). P — права, по которым модуль ищет адресатов:
 * у каждого модуля свои. Сбой push не ломает основное действие.
 */
export interface StaffNotifier<P extends string = string> {
  /** Адресатам по id; пустые и повторы отбрасываются. */
  notify(userIds: (string | null | undefined)[], n: StaffNotification): Promise<void>;
  /** Ответственному, а если его нет — всем, у кого есть право (неразобранное видят все). */
  notifyOwnerOr(assigneeId: string | null | undefined, permission: P, n: StaffNotification): Promise<void>;
  /** Всем активным сотрудникам с правом (руководителям — всегда). */
  notifyAllWith(permission: P, n: StaffNotification): Promise<void>;
}
