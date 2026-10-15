import type { AiProvider } from "@/modules/assistant/domain/providers";

/** Сохранённое для провайдера AI: ключ, модель, адрес; *Env — задано переменной окружения. */
export type AiProviderSaved = { apiKey: string; apiKeyEnv: boolean; model: string; baseUrl: string; baseUrlEnv: boolean };

/** Провайдер готов к работе: есть ключ (для своего сервера — адрес и модель). */
export const providerReady = (providers: Record<AiProvider, AiProviderSaved>, id: AiProvider) => (id === "custom" ? !!(providers.custom.baseUrl && providers.custom.model) : !!providers[id].apiKey || providers[id].apiKeyEnv);
