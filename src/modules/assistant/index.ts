import type { Clock, CustomFieldsReader, SettingsReader } from "@/shared/application";
import { AssistantService, ProofreadService, type ConversationReader, type LanguageModel } from "./application";
import { DESIGN_SETTING_KEYS, parseDesignAiSettings, type DesignAiSettings } from "@/lib/book/design-ai";
import { modelOf } from "./infrastructure/models";
import { aiConnections, type AssistantSettingKey } from "./infrastructure/connection";
import { crmAssistantData } from "./infrastructure/data";
import { askMedia } from "./infrastructure/media";
import { sellerModel } from "./application/SellerModel";

export { AssistantError, SELLER_TIERS, DEFAULT_TIER_MODELS, DEFAULT_PRICES, type SellerTier, type RoutePolicy, rewriteModes, type RewriteMode, normalizeExtracted, aiProviders, aiProviderIds, isAiProvider, type AiProvider, type AiSummary, type BotUnderstanding } from "./domain";
export { MEDIA_OPENROUTER_MODEL, providerSettingKeys } from "./infrastructure/connection";

/** Публичный фасад контекста «AI-помощник» (Claude, ChatGPT, DeepSeek или свой OpenAI-совместимый сервер). */
export class AssistantModule {
  /** AI-помощник CRM («Интеграции» → «AI-помощник»). */
  readonly service: AssistantService;
  /** AI-корректор ответов в редакторе книги — со своей моделью («Интеграции» → «Проверка текста»). */
  readonly proofreader: ProofreadService;
  /** AI-помощник при письме у клиента (оформить, улучшить, короче, длиннее) — свои провайдер, модель и флажок («Интеграции» → AI). */
  readonly writer: ProofreadService;
  readonly #ai: ReturnType<typeof aiConnections>;
  readonly #settings: SettingsReader<AssistantSettingKey>;

  /** Настройки «Интеграций» и свои поля сделки — порты рабочего пространства, переписка диалога — порт Messaging. */
  constructor(deps: { clock: Clock; settings: SettingsReader<AssistantSettingKey>; fields: CustomFieldsReader; conversations: ConversationReader }) {
    this.#settings = deps.settings;
    this.#ai = aiConnections(deps.settings);
    this.service = new AssistantService(modelOf(this.#ai.active), crmAssistantData(deps.settings, deps.fields, deps.conversations), deps.clock);
    this.proofreader = new ProofreadService(modelOf(this.#ai.proofread));
    this.writer = new ProofreadService(modelOf(this.#ai.writer));
    // Продажник: Claude по уровням (Haiku / Sonnet / Opus) — основной, остальные провайдеры — запасные; режим off — прежняя одна модель.
    this.seller = sellerModel(
      {
        policy: () => this.#ai.sellerPolicy(),
        claude: (model) => modelOf(this.#ai.claude(model)),
        fallbacks: async () => (await this.#ai.sellerFallbacks()).map((f) => modelOf(f.connection)),
        legacy: modelOf(this.#ai.seller),
      },
      this.#ai.media,
      askMedia,
    );
  }

  /** Модель AI-продажника бота («Интеграции» → AI → «Модель продажника»): маршрутизация Claude и запасные провайдеры. */
  readonly seller: ReturnType<typeof sellerModel>;

  /** Настройки ИИ-дизайнера из админки («ИИ-дизайнер»): включён ли, модели по сценариям, осмотр картинкой. */
  async designSettings(): Promise<DesignAiSettings> {
    return parseDesignAiSettings(await this.#settings.getMany([...DESIGN_SETTING_KEYS]));
  }

  /**
   * ИИ-дизайнер книги с этой моделью Claude (ключ Anthropic из «Интеграций»; включён ли — настройка «ИИ-дизайнер», а не
   * флажок AI-помощника CRM). Harness — lib/book/design-ai.
   */
  designerFor(model: string): LanguageModel {
    return modelOf(this.#ai.designer(model));
  }

  /** Провайдер AI-помощника при письме: свой или (пусто) — как у корректора. */
  writerProvider() {
    return this.#ai.writerProvider();
  }

  /** Провайдер AI-корректора: свой или (пусто) — как у помощника. */
  proofreadProvider() {
    return this.#ai.proofreadProvider();
  }

  /** Провайдер AI-продажника: свой или (пусто) — как у помощника. */
  sellerProvider() {
    return this.#ai.sellerProvider();
  }

  /** Запасные провайдеры продажника по порядку (для формы в «Интеграциях»). */
  async sellerFallbacks() {
    return (await this.#ai.sellerFallbacks()).map((f) => f.provider);
  }

  /** Провайдер распознавания голосовых и фото: свой или (пусто) — как у продажника. */
  mediaProvider() {
    return this.#ai.mediaProvider();
  }

  /** Модель распознавания голосовых и фото (для формы и проверки в «Интеграциях»). */
  async mediaModel() {
    const c = await this.#ai.media();
    return { provider: c.provider, model: c.model };
  }
}
