/** Правила задач CRM без зависимостей: их читают модуль клиентов, сервер и интерфейс. */

/** Чужие задачи закрывают и удаляют только с правом «все задачи»; свои, ничьи и поставленные мной — можно. */
export function canManageTask(actor: { userId: string; allTasks: boolean }, t: { assigneeId: string | null; createdById: string | null }) {
  return actor.allTasks || !t.assigneeId || t.assigneeId === actor.userId || t.createdById === actor.userId;
}
