/**
 * Провайдеры языковых моделей для AI-помощника. Claude — через Anthropic API, остальные — через
 * OpenAI-совместимый Chat Completions API (ChatGPT, DeepSeek, OpenRouter, а также Qwen, локальные модели).
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
    // deepseek-chat и deepseek-reasoner DeepSeek отключил 24.07.2026; deepseek-flash — текущая Flash (V4.1).
    defaultModel: "deepseek-flash",
    defaultBaseUrl: "https://api.deepseek.com",
    keysUrl: "https://platform.deepseek.com/api_keys",
    keyPlaceholder: "sk-…",
  },
  openrouter: {
    label: "OpenRouter",
    title: "OpenRouter (в т. ч. бесплатные модели)",
    // Роутер бесплатных моделей: сам выбирает доступную (отдельные бесплатные модели появляются и исчезают).
    defaultModel: "openrouter/free",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    keysUrl: "https://openrouter.ai/settings/keys",
    keyPlaceholder: "sk-or-…",
  },
  groq: {
    label: "Groq",
    title: "Groq (бесплатно: Whisper для голосовых)",
    defaultModel: "llama-3.3-70b-versatile",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    keysUrl: "https://console.groq.com/keys",
    keyPlaceholder: "gsk_…",
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
/**
 * Модель «Голосовые и фото» по умолчанию (поле модели пустое), по провайдеру. Один источник для сервера и формы в «Интеграциях».
 * OpenRouter — Gemini Flash: слушает голосовые WhatsApp (ogg) и видит фото. Groq — Whisper large-v3-turbo: расшифровка
 * голосовых всей CRM (чаты, бот, запасная у обращений), $0.04 за час аудио — в 2,8 раза дешевле large-v3; фото не понимает.
 */
export const mediaDefaultModels: Partial<Record<AiProvider, string>> = { openrouter: "google/gemini-2.5-flash", groq: "whisper-large-v3-turbo" };

export const aiProviderIds = Object.keys(aiProviders) as AiProvider[];
export const isAiProvider = (v: unknown): v is AiProvider => typeof v === "string" && Object.prototype.hasOwnProperty.call(aiProviders, v);

/**
 * Подходит ли модель провайдеру. Ловит модель, оставшуюся от другого провайдера (claude-haiku-5-5 у DeepSeek): такой запрос
 * провайдер отклоняет. Пустая подходит — будет модель по умолчанию. DeepSeek принимает только свои имена; у Claude не бывает
 * чужих префиксов и «/»; у OpenRouter и остальных голые имена Claude и DeepSeek не годятся (у OpenRouter — anthropic/…,
 * deepseek/…); свой сервер не проверяется.
 */
export function modelFits(provider: AiProvider, model: string) {
  const m = model.trim().toLowerCase();
  if (!m || provider === "custom") return true;
  if (provider === "deepseek") return m.startsWith("deepseek-");
  if (provider === "anthropic") return !/^(deepseek-|gpt-|o\d|whisper|llama)|\//.test(m);
  return !/^(claude-|deepseek-)/.test(m);
}

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
