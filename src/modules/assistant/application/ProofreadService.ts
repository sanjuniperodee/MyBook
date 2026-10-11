import { createHash } from "node:crypto";
import type { Locale } from "@/i18n/config";
import type { Issue } from "@/lib/proofread/types";
import { AssistantError, locateEdits, parseProofread, proofreadChunks, proofreadSchema, proofreadSystemPrompt } from "../domain";
import type { LanguageModel } from "./ports";

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m)
      try {
        return JSON.parse(m[0]);
      } catch {
        /* ниже — ошибка */
      }
    throw new AssistantError("badResponse", "Корректор вернул ответ в неожиданном формате — попробуйте ещё раз.");
  }
}

const CACHE_SIZE = 300;
const CACHE_TTL = 6 * 3600_000;

/**
 * AI-корректор ответов книги (кнопка «Проверить грамотность» в редакторе). Модель — своя, из настроек
 * «Проверка текста» в «Интеграциях» (может быть бесплатной моделью OpenRouter).
 * Одинаковый текст повторно не отправляется: результат живёт в памяти процесса несколько часов —
 * у бесплатных моделей дневной лимит запросов.
 */
export class ProofreadService {
  readonly #cache = new Map<string, { at: number; issues: Issue[] }>();

  constructor(private readonly model: LanguageModel) {}

  configured() {
    return this.model.configured();
  }

  describe() {
    return this.model.describe();
  }

  async check(text: string, language: Locale, ui: Locale, opts: { fresh?: boolean } = {}): Promise<Issue[]> {
    const key = createHash("sha1").update(`${language}|${ui}|${text}`).digest("hex");
    const hit = this.#cache.get(key);
    if (hit && !opts.fresh && Date.now() - hit.at < CACHE_TTL) return hit.issues;
    const system = proofreadSystemPrompt(language, ui);
    const parts = await Promise.all(
      proofreadChunks(text).map(async (chunk) => {
        const { text: reply } = await this.model.ask({ system, user: chunk.text, effort: "low", schema: proofreadSchema });
        return locateEdits(chunk.text, parseProofread(parseJson(reply)), chunk.offset);
      }),
    );
    const issues = parts.flat();
    this.#cache.set(key, { at: Date.now(), issues });
    if (this.#cache.size > CACHE_SIZE) this.#cache.delete(this.#cache.keys().next().value!);
    return issues;
  }

  /** Проверка подключения из «Интеграций»: фраза с заведомыми ошибками. */
  async test() {
    const issues = await this.check("Я думаю что ты прав, но мы не успели придти во время.", "ru", "ru", { fresh: true });
    return issues.map((i) => `${i.replacements[0]}`).join(", ");
  }
}
