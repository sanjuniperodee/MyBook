import type { AiConnection } from "../domain";
import type { LanguageModel } from "./ports";

/** Вложение для распознавания: картинка или аудио в base64. */
export interface MediaPart {
  kind: "image" | "audio";
  data: string;
  mime: string;
}

/** Итог распознавания: текст; «не умеет» (модель без vision/аудио — больше не пробовать); null — временный сбой. */
export type MediaRecognition = { text: string } | { unsupported: true; reason?: string };

/**
 * Модель AI-продажника: один запрос со схемой JSON. Таймаут короткий (клиент ждёт в чате), без повторов внутри —
 * повтор и запасной путь решает бот. Эффорт средний: продающая беседа требует суждения, а не скорости.
 * Вложения (голосовые, фото) распознаёт своё подключение («Интеграции» → AI → «Голосовые и фото»): беседа может идти на
 * модели без vision/аудио.
 */
export function sellerModel(
  model: LanguageModel,
  mediaConnection: () => Promise<AiConnection & { enabled?: boolean }>,
  media: (c: AiConnection & { enabled?: boolean }, input: { system: string; parts: MediaPart[]; timeoutMs: number }) => Promise<MediaRecognition | null>,
) {
  return {
    configured: () => model.configured(),
    describe: () => model.describe(),
    async complete(input: { system: string; user: string; schema: Record<string, unknown>; timeoutMs: number; cachePrefix?: string }): Promise<string> {
      const { text } = await model.ask({ system: input.system, user: input.user, effort: "medium", schema: input.schema, timeoutMs: input.timeoutMs, cachePrefix: input.cachePrefix });
      return text;
    },
    async media(input: { system: string; parts: MediaPart[]; timeoutMs: number }): Promise<MediaRecognition | null> {
      return media(await mediaConnection(), input);
    },
  };
}
