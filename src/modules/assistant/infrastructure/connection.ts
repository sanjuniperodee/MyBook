import "server-only";
import type { SettingsReader } from "@/shared/application";
import type { DesignSettingKey } from "@/lib/book/design-ai";
import { ROUTE_SETTING_KEYS, aiProviders, isAiProvider, readRoutePolicy, type AiConnection, type AiProvider, type RouteSettingKey } from "../domain";

const keys = {
  anthropic: { apiKey: "ai.apiKey", baseUrl: "ai.baseUrl", model: "ai.anthropic.model" },
  openai: { apiKey: "ai.openai.apiKey", baseUrl: "ai.openai.baseUrl", model: "ai.openai.model" },
  deepseek: { apiKey: "ai.deepseek.apiKey", baseUrl: "ai.deepseek.baseUrl", model: "ai.deepseek.model" },
  openrouter: { apiKey: "ai.openrouter.apiKey", baseUrl: "ai.openrouter.baseUrl", model: "ai.openrouter.model" },
  groq: { apiKey: "ai.groq.apiKey", baseUrl: "ai.groq.baseUrl", model: "ai.groq.model" },
  custom: { apiKey: "ai.custom.apiKey", baseUrl: "ai.custom.baseUrl", model: "ai.custom.model" },
} as const;

/** Модель OpenRouter для голосовых и фото по умолчанию: понимает аудио (ogg из WhatsApp) и изображения, дешёвая и быстрая. */
export const MEDIA_OPENROUTER_MODEL = "google/gemini-2.5-flash";
/** Groq: Whisper — бесплатная расшифровка голосовых (фото не понимает). */
export const MEDIA_GROQ_MODEL = "whisper-large-v3";

/** Ключи настроек провайдера (для формы в «Интеграциях»). */
export const providerSettingKeys = keys;

/** Настройки CRM, которые читает AI-помощник: провайдеры, база знаний и AI-корректор. */
export type AssistantSettingKey = (typeof keys)[AiProvider][keyof (typeof keys)[AiProvider]] | "ai.provider" | "ai.enabled" | "ai.knowledge" | "proofread.enabled" | "proofread.provider" | "proofread.model" | "seller.provider" | "seller.model" | "seller.fallbacks" | "media.provider" | "media.model" | "writer.enabled" | "writer.provider" | "writer.model" | DesignSettingKey | RouteSettingKey;

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

  /** Провайдер AI-помощника при письме: свой или (пусто) — как у корректора. */
  async function writerProvider(): Promise<{ provider: AiProvider; own: boolean }> {
    const p = await settings.get("writer.provider");
    return isAiProvider(p) ? { provider: p, own: true } : { provider: (await proofreadProvider()).provider, own: false };
  }

  /**
   * Подключение AI-помощника при письме у клиента (оформить, улучшить, короче, длиннее, по просьбе): свой провайдер, модель
   * и флажок. Пока ничего не задано, всё как у корректора — так было, пока настройки были общими.
   */
  const writer: Connection = async () => {
    const [{ provider }, model, proofModel, enabled, proofEnabled] = await Promise.all([writerProvider(), settings.get("writer.model"), settings.get("proofread.model"), settings.get("writer.enabled"), settings.get("proofread.enabled")]);
    const own = (await settings.get("writer.provider")) !== "";
    return { ...(await connectionOf(provider, model || (own ? "" : proofModel))), enabled: (enabled || proofEnabled) !== "off" };
  };

  /**
   * Подключение AI-продажника бота: свой провайдер и модель (или как у помощника). Отдельно от помощника: продающая беседа
   * требует сильной модели с надёжным JSON-ответом, а подсказки менеджеру могут идти и на лёгкой.
   */
  const seller: Connection = async () => {
    const [{ provider }, model] = await Promise.all([sellerProvider(), settings.get("seller.model")]);
    return connectionOf(provider, model);
  };

  /** Провайдер продажника: свой или (пусто) — как у помощника. */
  async function sellerProvider(): Promise<{ provider: AiProvider; own: boolean }> {
    const p = await settings.get("seller.provider");
    return isAiProvider(p) ? { provider: p, own: true } : { provider: await activeProvider(), own: false };
  }

  /** Провайдер распознавания голосовых и фото: свой или (пусто) — как у продажника. */
  async function mediaProvider(): Promise<{ provider: AiProvider; own: boolean }> {
    const p = await settings.get("media.provider");
    return isAiProvider(p) ? { provider: p, own: true } : { provider: (await sellerProvider()).provider, own: false };
  }

  /**
   * Подключение для голосовых и фото клиента. Своя модель или: у OpenRouter — Gemini Flash (слушает голосовые WhatsApp и
   * видит фото), у остальных — модель продажника. Отдельно от продажника: беседу можно вести на DeepSeek, который
   * вложения не понимает, а распознавать — на мультимодальной модели.
   */
  const media: Connection = async () => {
    const [{ provider, own }, model, sellerModel] = await Promise.all([mediaProvider(), settings.get("media.model"), settings.get("seller.model")]);
    // У Groq голосовые расшифровывает бесплатный Whisper.
    const fallback = provider === "openrouter" ? MEDIA_OPENROUTER_MODEL : provider === "groq" ? MEDIA_GROQ_MODEL : own ? "" : sellerModel;
    return connectionOf(provider, model || fallback);
  };

  /** Политика маршрутизации продажника: режим, модели уровней Claude, пороги, лимиты и прайс. */
  async function sellerPolicy() {
    return readRoutePolicy(await settings.getMany([...ROUTE_SETTING_KEYS]));
  }

  /**
   * Claude для ИИ-дизайнера с заданной моделью: ключ и адрес Anthropic из «Интеграций», а включён ли дизайнер — своя
   * настройка («ИИ-дизайнер» в админке), а не флажок AI-помощника CRM.
   */
  const designer =
    (model: string): Connection =>
    async () => ({ ...(await connectionOf("anthropic", model)), enabled: (await settings.get("designAi.enabled")) !== "off" });

  /** Claude с заданной моделью: ключ и адрес Anthropic из «Интеграций». */
  const claude =
    (model: string): Connection =>
    async () =>
      connectionOf("anthropic", model);

  /**
   * Запасные провайдеры продажника по порядку (seller.fallbacks: «openai,deepseek»), Anthropic среди них не бывает — он
   * основной. Пусто — провайдер, который был выбран для продажника раньше (seller.provider или провайдер помощника), если
   * это не Claude: данные клиентов уходят только туда, куда уходили и раньше. У прежнего провайдера — прежняя модель
   * (seller.model), у остальных — модель провайдера.
   */
  async function sellerFallbacks(): Promise<{ provider: AiProvider; connection: Connection }[]> {
    const [raw, legacy, model] = await Promise.all([settings.get("seller.fallbacks"), sellerProvider(), settings.get("seller.model")]);
    const listed = (raw ?? "")
      .split(/[\s,;]+/)
      .filter(isAiProvider)
      .filter((p, i, all) => p !== "anthropic" && all.indexOf(p) === i);
    const order = raw?.trim() ? listed : legacy.provider !== "anthropic" ? [legacy.provider] : [];
    return order.map((provider) => ({ provider, connection: () => connectionOf(provider, provider === legacy.provider ? model : "") }));
  }

  return { active, proofread, proofreadProvider, writer, writerProvider, designer, seller, sellerProvider, sellerPolicy, sellerFallbacks, claude, media, mediaProvider };
}
