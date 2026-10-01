import type { Clock } from "@/shared/application";
import { AssistantService } from "./application";
import { claudeModel } from "./infrastructure/claude";
import { crmAssistantData } from "./infrastructure/data";

export { AssistantError, normalizeExtracted, temperatureLabels, type AiSummary } from "./domain";

/** Публичный фасад контекста «AI-помощник» (Claude). */
export class AssistantModule {
  readonly service: AssistantService;

  constructor(deps: { clock: Clock }) {
    this.service = new AssistantService(claudeModel, crmAssistantData, deps.clock);
  }
}
