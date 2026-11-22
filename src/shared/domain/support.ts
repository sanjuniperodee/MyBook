/**
 * Значения обращений, общие для схемы БД, модуля support и интерфейса (форма на сайте, страница CRM). Без зависимостей.
 */
export const SUPPORT_STATUSES = ["new", "in_progress", "waiting", "done", "rejected"] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

export const SUPPORT_STATUS_LABELS: Record<SupportStatus, string> = {
  new: "Новое",
  in_progress: "В работе",
  waiting: "Ждём ответа",
  done: "Исправлено",
  rejected: "Отклонено",
};

/** Обращение закрыто — в работе его больше нет. */
export const isClosedStatus = (s: SupportStatus) => s === "done" || s === "rejected";

export const SUPPORT_KINDS = ["bug", "change", "question", "other"] as const;
export type SupportKind = (typeof SUPPORT_KINDS)[number];

export const SUPPORT_KIND_LABELS: Record<SupportKind, string> = {
  bug: "Что-то не работает",
  change: "Нужно изменить или добавить",
  question: "Вопрос",
  other: "Другое",
};

export const SUPPORT_URGENCIES = ["normal", "urgent"] as const;
export type SupportUrgency = (typeof SUPPORT_URGENCIES)[number];

export type SupportAttachmentKind = "audio" | "image" | "video" | "file";

/** Вложение обращения: файл в хранилище (support/<id обращения>/<id>.<расширение>) и расшифровка для голосовых и видео. */
export interface SupportAttachment {
  id: string;
  key: string;
  name: string;
  mime: string;
  size: number;
  kind: SupportAttachmentKind;
  /** Записано голосом прямо в форме (а не загружено файлом). */
  recorded?: boolean;
  transcript?: string;
  /** Кто расшифровал: «gemini» — Gemini через OpenRouter, «whisper» — запасной Whisper (хуже на казахском и смешанной речи). */
  transcriptBy?: string;
  transcriptError?: string;
}

/** Коммит, который выкатили по обращению. */
export interface SupportCommit {
  sha: string;
  subject: string;
  release: string;
  at: string;
}

/** Строка истории обращения: смена статуса, уведомление, выкатка, заметка. */
export interface SupportEvent {
  at: string;
  by: string;
  text: string;
}

/**
 * Сообщение из переписки клиента, приложенное к обращению: копия на момент привязки (чат могут почистить) и расшифровка
 * голосового — своя, Gemini, даже если в чате уже есть расшифровка Whisper.
 */
export interface SupportChatMessage {
  id: string;
  at: string;
  /** in — от клиента, out — от магазина. */
  direction: string;
  type: string;
  text: string;
  transcript?: string;
  transcriptBy?: string;
  transcriptError?: string;
}

/** Переписка, из которой взято обращение. */
export interface SupportChat {
  conversationId: string;
  contact: string;
  chatId: string;
  messages: SupportChatMessage[];
}
