import type { AiField, AiMessage, AiProvider, AiSummary, DealDossier } from "../domain";

/**
 * Расход токенов запроса (пишется в журнал действий). input — без кэша; cacheRead / cacheWrite — чтение и запись кэша
 * префикса (Claude); model — модель, которая фактически ответила (после серверного резерва может отличаться).
 */
export type Usage = { input: number; output: number; cacheRead?: number; cacheWrite?: number; model?: string };

/**
 * Языковая модель (Claude, ChatGPT, DeepSeek или свой OpenAI-совместимый сервер — выбирается в «Интеграциях»).
 * Ошибки — AssistantError с понятным менеджеру текстом.
 */
export interface LanguageModel {
  /** Какая модель сейчас отвечает — для подписей в интерфейсе. */
  describe(): Promise<{ provider: AiProvider; label: string; model: string }>;
  /**
   * timeoutMs — для быстрых запросов (бот в чате): без повторов, по истечении — ошибка. По умолчанию 90 секунд.
   * cachePrefix — стабильное начало system (одинаковое между запросами): провайдер с кэшем префикса (Claude) хранит его
   * и не тарифицирует заново; должно быть именно началом строки system.
   * cacheTtl — сколько живёт кэш префикса: 1h (по умолчанию; запись стоит вдвое дороже входа, окупается частыми запросами,
   * как у бота) или 5m (запись в 1,25 раза; для редких запросов, как у ИИ-дизайнера).
   * images — картинки к запросу (base64; ИИ-дизайнер показывает модели готовую обложку); провайдеры без зрения их игнорируют.
   */
  ask(req: { system: string; user: string; effort: "low" | "medium" | "high"; schema?: Record<string, unknown>; timeoutMs?: number; cachePrefix?: string; cacheTtl?: "5m" | "1h"; images?: { mime: string; data: string }[] }): Promise<{ text: string; usage: Usage }>;
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
