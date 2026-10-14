import type { Clock, CustomFieldsReader, SettingsReader } from "@/shared/application";
import { AssistantService, ProofreadService } from "./application";
import { modelOf } from "./infrastructure/models";
import { aiConnections, type AssistantSettingKey } from "./infrastructure/connection";
import { crmAssistantData } from "./infrastructure/data";

export { AssistantError, normalizeExtracted, aiProviders, aiProviderIds, isAiProvider, type AiProvider, type AiSummary } from "./domain";
export { providerSettingKeys } from "./infrastructure/connection";

/** Публичный фасад контекста «AI-помощник» (Claude, ChatGPT, DeepSeek или свой OpenAI-совместимый сервер). */
export class AssistantModule {
  /** AI-помощник CRM («Интеграции» → «AI-помощник»). */
  readonly service: AssistantService;
  /** AI-корректор ответов в редакторе книги — со своей моделью («Интеграции» → «Проверка текста»). */
  readonly proofreader: ProofreadService;
  readonly #ai: ReturnType<typeof aiConnections>;

  /** Настройки «Интеграций» и свои поля сделки — порты рабочего пространства. */
  constructor(deps: { clock: Clock; settings: SettingsReader<AssistantSettingKey>; fields: CustomFieldsReader }) {
    this.#ai = aiConnections(deps.settings);
    this.service = new AssistantService(modelOf(this.#ai.active), crmAssistantData(deps.settings, deps.fields), deps.clock);
    this.proofreader = new ProofreadService(modelOf(this.#ai.proofread));
  }

  /** Провайдер AI-корректора: свой или (пусто) — как у помощника. */
  proofreadProvider() {
    return this.#ai.proofreadProvider();
  }
}
