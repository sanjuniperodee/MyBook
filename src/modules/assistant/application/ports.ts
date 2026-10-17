import type { AiField, AiMessage, AiProvider, AiSummary, DealDossier } from "../domain";

/** Расход токенов запроса (пишется в журнал действий). */
export type Usage = { input: number; output: number };

/**
 * Языковая модель (Claude, ChatGPT, DeepSeek или свой OpenAI-совместимый сервер — выбирается в «Интеграциях»).
 * Ошибки — AssistantError с понятным менеджеру текстом.
 */
export interface LanguageModel {
  /** Какая модель сейчас отвечает — для подписей в интерфейсе. */
  describe(): Promise<{ provider: AiProvider; label: string; model: string }>;
  /** timeoutMs — для быстрых запросов (бот в чате): без повторов, по истечении — ошибка. По умолчанию 90 секунд. */
  ask(req: { system: string; user: string; effort: "low" | "medium"; schema?: Record<string, unknown>; timeoutMs?: number }): Promise<{ text: string; usage: Usage }>;
  configured(): Promise<boolean>;
}

/** Сообщение диалога в том виде, как его отдаёт переписка (контекст Messaging). */
export interface ConversationMessage {
  direction: "in" | "out";
  type: string;
  text: string;
  mediaUrl: string | null;
  /** Вложение лежит в шлюзе WhatsApp (mediaUrl тогда пустой). */
  gateway?: boolean;
  /** Внутренняя заметка сотрудника — клиент её не видел. */
  internal?: boolean;
  author: string | null;
  at: string;
}

/** Переписка с клиентом (контекст Messaging): последние сообщения диалога по порядку. */
export interface ConversationReader {
  messages(conversationId: string, limit: number): Promise<ConversationMessage[]>;
}

export interface AssistantData {
  transcript(conversationId: string, limit: number): Promise<AiMessage[]>;
  dossier(dealId: string): Promise<DealDossier | null>;
  dealFields(): Promise<AiField[]>;
  knowledge(): Promise<string>;
  saveSummary(dealId: string, summary: AiSummary & { at: string }): Promise<void>;
}
