import "server-only";
import type { LanguageModel } from "../application";
import { AssistantError, aiProviders, connectionReady } from "../domain";
import { askClaude } from "./claude";
import { activeConnection } from "./connection";
import { askOpenAiCompatible } from "./openaiCompatible";

/** Модель, выбранная в «Интеграциях»: Claude — через Anthropic SDK, остальные — через OpenAI-совместимый API. */
export const configuredModel: LanguageModel = {
  async configured() {
    const c = await activeConnection();
    return c.enabled && connectionReady(c);
  },
  async describe() {
    const c = await activeConnection();
    return { provider: c.provider, label: aiProviders[c.provider].label, model: c.model };
  },
  async ask(req) {
    const c = await activeConnection();
    if (!c.enabled || !connectionReady(c)) {
      throw new AssistantError("notConfigured", c.provider === "custom" ? "AI-помощник не подключён — укажите адрес API и модель в разделе «Интеграции»." : `AI-помощник не подключён — добавьте ключ ${aiProviders[c.provider].title} в разделе «Интеграции».`);
    }
    return c.provider === "anthropic" ? askClaude(c, req) : askOpenAiCompatible(c, req);
  },
};
