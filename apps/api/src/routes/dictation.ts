/**
 * Голос → текст для ответа в книге (приложение клиента; на сайте диктовка — Web Speech API браузера). Распознаёт
 * assistant.dictate (та же цепочка моделей, что у обращений); текст в ответ вставляет приложение. Платный вызов AI —
 * поэтому лимит на клиента: 20 записей за 10 минут и 150 за сутки (как у загрузки фото — фиксированный, без настройки).
 */
import { apiBook, HttpError } from "@/server/api";
import { container } from "@/server/container";
import { rateLimit } from "@/server/rateLimit";
import type { Handlers } from "../app";

/** ~10 минут записи в m4a/aac (до ~1,5 МБ в минуту) с запасом. */
const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

export const dictationHandlers: Pick<Handlers, "answerDictate"> = {
  async answerDictate({ req, input }) {
    const { user, book } = await apiBook(req, input.bookId, { editable: true });
    const audio = (input.files as File[])[0];
    if (!audio) throw new HttpError(400, "badRequest");
    if (audio.size > MAX_AUDIO_BYTES) throw new HttpError(413, "dictationTooLong");
    if (!(await rateLimit(`dictation:${user.id}`, 20, 600_000)) || !(await rateLimit(`dictation-day:${user.id}`, 150, 86_400_000))) throw new HttpError(429, "dictationRate");
    const res = await container().assistant.dictate({ data: Buffer.from(await audio.arrayBuffer()).toString("base64"), mime: audio.type || "audio/mp4", language: book.language === "kk" ? "kk" : "ru" });
    if ("error" in res) {
      console.error("[api] dictation", res.error);
      throw new HttpError(502, "dictationFailed");
    }
    return { text: res.text.trim() };
  },
};
