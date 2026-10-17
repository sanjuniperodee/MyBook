import type { LanguageModel } from "./ports";

/**
 * Модель AI-продажника: один запрос со схемой JSON. Таймаут короткий (клиент ждёт в чате), без повторов внутри —
 * повтор и запасной путь решает бот. Эффорт средний: продающая беседа требует суждения, а не скорости.
 */
export function sellerModel(model: LanguageModel) {
  return {
    configured: () => model.configured(),
    describe: () => model.describe(),
    async complete(input: { system: string; user: string; schema: Record<string, unknown>; timeoutMs: number }): Promise<string> {
      const { text } = await model.ask({ system: input.system, user: input.user, effort: "medium", schema: input.schema, timeoutMs: input.timeoutMs });
      return text;
    },
  };
}
