import "server-only";
import { getSetting, getSettings } from "@/modules/workspace";
import { aiProviders, isAiProvider, type AiConnection, type AiProvider } from "../domain";

const keys = {
  anthropic: { apiKey: "ai.apiKey", baseUrl: "ai.baseUrl", model: "ai.anthropic.model" },
  openai: { apiKey: "ai.openai.apiKey", baseUrl: "ai.openai.baseUrl", model: "ai.openai.model" },
  deepseek: { apiKey: "ai.deepseek.apiKey", baseUrl: "ai.deepseek.baseUrl", model: "ai.deepseek.model" },
  openrouter: { apiKey: "ai.openrouter.apiKey", baseUrl: "ai.openrouter.baseUrl", model: "ai.openrouter.model" },
  custom: { apiKey: "ai.custom.apiKey", baseUrl: "ai.custom.baseUrl", model: "ai.custom.model" },
} as const;

/** Ключи настроек провайдера (для формы в «Интеграциях»). */
export const providerSettingKeys = keys;

export async function activeProvider(): Promise<AiProvider> {
  const p = await getSetting("ai.provider");
  return isAiProvider(p) ? p : "anthropic";
}

async function connectionOf(provider: AiProvider, modelOverride = "") {
  const k = keys[provider];
  const v = await getSettings([k.apiKey, k.baseUrl, k.model, "ai.enabled"]);
  const def = aiProviders[provider];
  return {
    provider,
    apiKey: v[k.apiKey],
    baseUrl: (v[k.baseUrl] || def.defaultBaseUrl).replace(/\/+$/, ""),
    model: modelOverride || v[k.model] || def.defaultModel,
    enabled: v["ai.enabled"] !== "off",
  };
}

/** Подключение к выбранному провайдеру: пустые модель и адрес заменяются значениями по умолчанию. */
export async function activeConnection(): Promise<AiConnection & { enabled: boolean }> {
  return connectionOf(await activeProvider());
}

/** Провайдер AI-корректора: свой или (пусто) — как у помощника. */
export async function proofreadProvider(): Promise<{ provider: AiProvider; own: boolean }> {
  const p = await getSetting("proofread.provider");
  return isAiProvider(p) ? { provider: p, own: true } : { provider: await activeProvider(), own: false };
}

/**
 * Подключение AI-корректора в редакторе книги: свой провайдер и модель (или как у помощника).
 * Включается своим флажком — кнопки помощника в CRM на него не влияют.
 */
export async function proofreadConnection(): Promise<AiConnection & { enabled: boolean }> {
  const [{ provider }, model, enabled] = await Promise.all([proofreadProvider(), getSetting("proofread.model"), getSetting("proofread.enabled")]);
  return { ...(await connectionOf(provider, model)), enabled: enabled !== "off" };
}
