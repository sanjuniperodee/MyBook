/**
 * Мгновенные обновления открытых экранов CRM (реализация — modules/workspace: PostgreSQL LISTEN/NOTIFY, браузеру — SSE),
 * поэтому работают и при нескольких процессах приложения.
 */
export interface LiveEvent {
  /** notify — новое уведомление, chat — сообщение/статус в чате, call — звонок, board — карточка или доска задач. */
  type: "notify" | "chat" | "call" | "board";
  /** Кому адресовано (для notify); без users — всем сотрудникам. */
  users?: string[];
  conversationId?: string;
  /** Доска и карточка (type board): открытая доска перечитывает себя. Карточки сообщает триггер БД crm_tasks_live. */
  boardId?: string | null;
  taskId?: string | null;
}

export interface LiveFeed {
  /** Разослать событие всем процессам. Ошибка публикации не ломает основное действие. */
  publish(e: LiveEvent): Promise<void>;
}
