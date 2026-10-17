import "server-only";
import type { SettingsReader } from "@/shared/application";
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

/** Настройки CRM, которые читает AI-помощник: провайдеры, база знаний и AI-корректор. */
export type AssistantSettingKey = (typeof keys)[AiProvider][keyof (typeof keys)[AiProvider]] | "ai.provider" | "ai.enabled" | "ai.knowledge" | "proofread.enabled" | "proofread.provider" | "proofread.model" | "seller.provider" | "seller.model";

/** Подключение к модели: пустые модель и адрес заменены значениями по умолчанию. */
export type Connection = () => Promise<AiConnection & { enabled: boolean }>;

/** Подключения AI-помощника CRM и AI-корректора в редакторе книги — по настройкам «Интеграций». */
export function aiConnections(settings: SettingsReader<AssistantSettingKey>) {
  async function activeProvider(): Promise<AiProvider> {
    const p = await settings.get("ai.provider");
    return isAiProvider(p) ? p : "anthropic";
  }

  async function connectionOf(provider: AiProvider, modelOverride = "") {
    const k = keys[provider];
    const v = await settings.getMany([k.apiKey, k.baseUrl, k.model, "ai.enabled"]);
    const def = aiProviders[provider];
    return {
      provider,
      apiKey: v[k.apiKey],
      baseUrl: (v[k.baseUrl] || def.defaultBaseUrl).replace(/\/+$/, ""),
      model: modelOverride || v[k.model] || def.defaultModel,
      enabled: v["ai.enabled"] !== "off",
    };
  }

  /** Провайдер AI-корректора: свой или (пусто) — как у помощника. */
  async function proofreadProvider(): Promise<{ provider: AiProvider; own: boolean }> {
    const p = await settings.get("proofread.provider");
    return isAiProvider(p) ? { provider: p, own: true } : { provider: await activeProvider(), own: false };
  }

  /** Подключение к выбранному провайдеру помощника. */
  const active: Connection = async () => connectionOf(await activeProvider());

  /**
   * Подключение AI-корректора в редакторе книги: свой провайдер и модель (или как у помощника).
   * Включается своим флажком — кнопки помощника в CRM на него не влияют.
   */
  const proofread: Connection = async () => {
    const [{ provider }, model, enabled] = await Promise.all([proofreadProvider(), settings.get("proofread.model"), settings.get("proofread.enabled")]);
    return { ...(await connectionOf(provider, model)), enabled: enabled !== "off" };
  };

  /**
   * Подключение AI-продажника бота: свой провайдер и модель (или как у помощника). Отдельно от помощника: продающая беседа
   * требует сильной модели с надёжным JSON-ответом, а подсказки менеджеру могут идти и на лёгкой.
   */
  const seller: Connection = async () => {
    const [p, model] = await Promise.all([settings.get("seller.provider"), settings.get("seller.model")]);
    const provider = isAiProvider(p) ? p : await activeProvider();
    // Модель задана только для своего провайдера: при смене провайдера прежняя модель не подставляется.
    return connectionOf(provider, isAiProvider(p) || provider === (await activeProvider()) ? model : "");
  };

  return { active, proofread, proofreadProvider, seller };
}
