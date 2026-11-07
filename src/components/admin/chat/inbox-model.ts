/** Модель списка «Чатов» без разметки: её делят страница, живое обновление списка и API (/api/admin/chats/inbox). */

export const CHAT_FILTERS = { open: "Открытые", mine: "Мои", unread: "Непрочитанные", waiting: "Ждут ответа", closed: "Закрытые" } as const;
export type ChatFilter = keyof typeof CHAT_FILTERS;

/** Событие окна от открытой переписки: сервер снял «непрочитано» с диалога (detail: { conversationId }). */
export const CHAT_READ_EVENT = "crm:chat-read";

/**
 * Строки без счётчика у диалогов, прочитанных в этой вкладке. Страница чатов из кэша роутера (staleTimes, до 30 с)
 * приносит строки, снятые до отметки, — на телефоне после «назад» счётчик возвращался. Свежие строки с сервера
 * (/api/admin/chats/inbox) после события о диалоге верны сами — для них набор уже пуст.
 */
export function withoutRead(items: ChatListItem[], read: ReadonlySet<string>): ChatListItem[] {
  if (!read.size) return items;
  return items.map((c) => (c.unread && read.has(c.id) ? { ...c, unread: 0 } : c));
}

export interface ChatListItem {
  id: string;
  title: string;
  avatarUrl: string | null;
  channel: string;
  time: string;
  preview: string;
  unread: number;
  /** Кто ведёт; null — не назначен. */
  assignee: string | null;
  /** Ждёт ответа столько рабочих минут (responseWait); null — не ждёт. */
  waitMinutes: number | null;
  /** Подпись ожидания (responseWait: «1 ч 5 мин», «2 раб. дн») — та же, что в «Моём дне»; нет — из waitMinutes. */
  waitLabel?: string | null;
  /** Норматив ответа вышел. */
  overdue: boolean;
  bot: boolean;
  /** Закреплён у текущего сотрудника — стоит вверху списка. */
  pinned: boolean;
}
