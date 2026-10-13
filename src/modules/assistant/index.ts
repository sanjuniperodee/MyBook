import type { Clock } from "@/shared/application";
import { AssistantService, ProofreadService } from "./application";
import { configuredModel, proofreadModel } from "./infrastructure/models";
import { crmAssistantData } from "./infrastructure/data";

export { AssistantError, normalizeExtracted, aiProviders, aiProviderIds, isAiProvider, type AiProvider, type AiSummary } from "./domain";
export { providerSettingKeys, proofreadProvider } from "./infrastructure/connection";

/** Публичный фасад контекста «AI-помощник» (Claude, ChatGPT, DeepSeek или свой OpenAI-совместимый сервер). */
export class AssistantModule {
  readonly service: AssistantService;
  /** AI-корректор ответов в редакторе книги — со своей моделью. */
  readonly proofreader: ProofreadService;

  constructor(deps: { clock: Clock }) {
    this.service = new AssistantService(configuredModel, crmAssistantData, deps.clock);
    this.proofreader = new ProofreadService(proofreadModel);
  }
}
