import type { Clock, CustomFieldsReader, SettingsReader } from "@/shared/application";
import { AssistantService, ProofreadService, type ConversationReader } from "./application";
import { modelOf } from "./infrastructure/models";
import { aiConnections, type AssistantSettingKey } from "./infrastructure/connection";
import { crmAssistantData } from "./infrastructure/data";
import { askMedia } from "./infrastructure/media";
import { sellerModel } from "./application/SellerModel";

export { AssistantError, normalizeExtracted, aiProviders, aiProviderIds, isAiProvider, type AiProvider, type AiSummary, type BotUnderstanding } from "./domain";
export { MEDIA_OPENROUTER_MODEL, providerSettingKeys } from "./infrastructure/connection";

/** Публичный фасад контекста «AI-помощник» (Claude, ChatGPT, DeepSeek или свой OpenAI-совместимый сервер). */
export class AssistantModule {
  /** AI-помощник CRM («Интеграции» → «AI-помощник»). */
  readonly service: AssistantService;
  /** AI-корректор ответов в редакторе книги — со своей моделью («Интеграции» → «Проверка текста»). */
  readonly proofreader: ProofreadService;
  readonly #ai: ReturnType<typeof aiConnections>;

  /** Настройки «Интеграций» и свои поля сделки — порты рабочего пространства, переписка диалога — порт Messaging. */
  constructor(deps: { clock: Clock; settings: SettingsReader<AssistantSettingKey>; fields: CustomFieldsReader; conversations: ConversationReader }) {
    this.#ai = aiConnections(deps.settings);
    this.service = new AssistantService(modelOf(this.#ai.active), crmAssistantData(deps.settings, deps.fields, deps.conversations), deps.clock);
    this.proofreader = new ProofreadService(modelOf(this.#ai.proofread));
    this.seller = sellerModel(modelOf(this.#ai.seller), this.#ai.media, askMedia);
  }

  /** Модель AI-продажника бота («Интеграции» → AI → «Модель продажника»). */
  readonly seller: ReturnType<typeof sellerModel>;

  /** Провайдер AI-корректора: свой или (пусто) — как у помощника. */
  proofreadProvider() {
    return this.#ai.proofreadProvider();
  }

  /** Провайдер AI-продажника: свой или (пусто) — как у помощника. */
  sellerProvider() {
    return this.#ai.sellerProvider();
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
