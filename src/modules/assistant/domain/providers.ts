/**
 * Провайдеры языковых моделей для AI-помощника. Claude — через Anthropic API, остальные — через
 * OpenAI-совместимый Chat Completions API (ChatGPT, DeepSeek, а также OpenRouter, Qwen, локальные модели).
 */
export const aiProviders = {
  anthropic: {
    label: "Claude",
    title: "Claude (Anthropic)",
    defaultModel: "claude-opus-5-5",
    defaultBaseUrl: "https://api.anthropic.com",
    keysUrl: "https://platform.claude.com/settings/keys",
    keyPlaceholder: "sk-ant-…",
  },
  openai: {
    label: "ChatGPT",
    title: "ChatGPT (OpenAI)",
    defaultModel: "gpt-5",
    defaultBaseUrl: "https://api.openai.com/v1",
    keysUrl: "https://platform.openai.com/api-keys",
    keyPlaceholder: "sk-…",
  },
  deepseek: {
    label: "DeepSeek",
    title: "DeepSeek",
    defaultModel: "deepseek-chat",
    defaultBaseUrl: "https://api.deepseek.com",
    keysUrl: "https://platform.deepseek.com/api_keys",
    keyPlaceholder: "sk-…",
  },
  custom: {
    label: "AI",
    title: "Другой (OpenAI-совместимый API)",
    defaultModel: "",
    defaultBaseUrl: "",
    keysUrl: "",
    keyPlaceholder: "ключ, если сервис его требует",
  },
} as const;

export type AiProvider = keyof typeof aiProviders;
export const aiProviderIds = Object.keys(aiProviders) as AiProvider[];
export const isAiProvider = (v: unknown): v is AiProvider => typeof v === "string" && Object.prototype.hasOwnProperty.call(aiProviders, v);

/** Настройки подключения к выбранному провайдеру (модель и адрес — уже с подставленными значениями по умолчанию). */
export interface AiConnection {
  provider: AiProvider;
  apiKey: string;
  model: string;
  baseUrl: string;
}

/** Можно ли отправлять запросы: у облачных провайдеров нужен ключ, у своего сервера — адрес и модель. */
export function connectionReady(c: AiConnection) {
  if (c.provider === "custom") return !!(c.baseUrl && c.model);
  return !!c.apiKey;
}
