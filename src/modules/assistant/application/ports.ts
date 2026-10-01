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
  ask(req: { system: string; user: string; effort: "low" | "medium"; schema?: Record<string, unknown> }): Promise<{ text: string; usage: Usage }>;
  configured(): Promise<boolean>;
}

export interface AssistantData {
  transcript(conversationId: string, limit: number): Promise<AiMessage[]>;
  dossier(dealId: string): Promise<DealDossier | null>;
  dealFields(): Promise<AiField[]>;
  knowledge(): Promise<string>;
  saveSummary(dealId: string, summary: AiSummary & { at: string }): Promise<void>;
}
