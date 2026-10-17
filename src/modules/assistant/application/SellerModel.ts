import type { AiConnection } from "../domain";
import type { LanguageModel } from "./ports";

/** Вложение для распознавания: картинка или аудио в base64. */
export interface MediaPart {
  kind: "image" | "audio";
  data: string;
  mime: string;
}

/**
 * Модель AI-продажника: один запрос со схемой JSON. Таймаут короткий (клиент ждёт в чате), без повторов внутри —
 * повтор и запасной путь решает бот. Эффорт средний: продающая беседа требует суждения, а не скорости.
 * Вложения (голосовые, фото) распознаются той же моделью через askMedia (инфраструктура передаётся модулем):
 * не умеет — null, бот идёт старым путём.
 */
export function sellerModel(model: LanguageModel, connection: () => Promise<AiConnection>, media: (c: AiConnection, input: { system: string; parts: MediaPart[]; timeoutMs: number }) => Promise<string | null>) {
  return {
    configured: () => model.configured(),
    describe: () => model.describe(),
    async complete(input: { system: string; user: string; schema: Record<string, unknown>; timeoutMs: number }): Promise<string> {
      const { text } = await model.ask({ system: input.system, user: input.user, effort: "medium", schema: input.schema, timeoutMs: input.timeoutMs });
      return text;
    },
    async media(input: { system: string; parts: { kind: "image" | "audio"; data: string; mime: string }[]; timeoutMs: number }): Promise<string | null> {
      return media(await connection(), input);
    },
  };
}
