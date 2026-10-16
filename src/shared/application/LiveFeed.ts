/**
 * Мгновенные обновления открытых экранов CRM (реализация — modules/workspace: PostgreSQL LISTEN/NOTIFY, браузеру — SSE),
 * поэтому работают и при нескольких процессах приложения.
 */
export interface LiveEvent {
  /** notify — новое уведомление, chat — сообщение/статус в чате, call — звонок. */
  type: "notify" | "chat" | "call";
  /** Кому адресовано (для notify); без users — всем сотрудникам. */
  users?: string[];
  conversationId?: string;
}

export interface LiveFeed {
  /** Разослать событие всем процессам. Ошибка публикации не ломает основное действие. */
  publish(e: LiveEvent): Promise<void>;
}
