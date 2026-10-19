import "server-only";
import type { LanguageModel } from "../application";
import { AssistantError, aiProviders, connectionReady } from "../domain";
import { askClaude } from "./claude";
import type { Connection } from "./connection";
import { askOpenAiCompatible } from "./openaiCompatible";

/** Модель по подключению: Claude — через Anthropic SDK, остальные — через OpenAI-совместимый API. */
export function modelOf(connection: Connection): LanguageModel {
  return {
    async configured() {
      const c = await connection();
      return c.enabled && connectionReady(c);
    },
    async describe() {
      const c = await connection();
      return { provider: c.provider, label: aiProviders[c.provider].label, model: c.model };
    },
    ask: (req) => ask(connection, req),
  };
}

async function ask(connection: Connection, req: Parameters<LanguageModel["ask"]>[0]) {
  const c = await connection();
  if (!c.enabled || !connectionReady(c)) {
    throw new AssistantError("notConfigured", c.provider === "custom" ? "AI-помощник не подключён — укажите адрес API и модель в разделе «Интеграции»." : `AI-помощник не подключён — добавьте ключ ${aiProviders[c.provider].title} в разделе «Интеграции».`);
  }
  return c.provider === "anthropic" ? askClaude(c, req) : askOpenAiCompatible(c, req);
}
