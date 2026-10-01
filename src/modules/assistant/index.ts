import type { Clock } from "@/shared/application";
import { AssistantService } from "./application";
import { configuredModel } from "./infrastructure/models";
import { crmAssistantData } from "./infrastructure/data";

export { AssistantError, normalizeExtracted, temperatureLabels, aiProviders, aiProviderIds, isAiProvider, type AiProvider, type AiSummary } from "./domain";
export { providerSettingKeys } from "./infrastructure/connection";

/** Публичный фасад контекста «AI-помощник» (Claude, ChatGPT, DeepSeek или свой OpenAI-совместимый сервер). */
export class AssistantModule {
  readonly service: AssistantService;

  constructor(deps: { clock: Clock }) {
    this.service = new AssistantService(configuredModel, crmAssistantData, deps.clock);
  }
}
