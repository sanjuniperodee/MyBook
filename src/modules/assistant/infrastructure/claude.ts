import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { LanguageModel } from "../application";
import { AssistantError, type AiConnection } from "../domain";

let cached: { sig: string; client: Anthropic } | null = null;

function client(c: AiConnection) {
  const sig = `${c.apiKey}|${c.baseUrl}`;
  if (cached?.sig !== sig) cached = { sig, client: new Anthropic({ apiKey: c.apiKey, baseURL: c.baseUrl, maxRetries: 2, timeout: 90_000 }) };
  return cached.client;
}

function toAssistantError(err: unknown): Error {
  if (AssistantError.is(err)) return err;
  if (err instanceof Anthropic.AuthenticationError) return new AssistantError("notConfigured", "Ключ Claude API неверный или отозван — проверьте его в «Интеграциях».");
  if (err instanceof Anthropic.PermissionDeniedError) return new AssistantError("notConfigured", "У ключа Claude API нет доступа к модели.");
  if (err instanceof Anthropic.NotFoundError) return new AssistantError("notConfigured", "Модель Claude не найдена — проверьте её название в «Интеграциях».");
  if (err instanceof Anthropic.RateLimitError) return new AssistantError("unavailable", "Слишком много запросов к Claude — попробуйте через минуту.");
  if (err instanceof Anthropic.APIConnectionError) return new AssistantError("unavailable", "Нет связи с Claude API. Попробуйте позже.");
  if (err instanceof Anthropic.BadRequestError) {
    console.error("[ai] bad request", err.message);
    return new AssistantError("unavailable", "Claude API отклонил запрос. Подробности — в логах сервера.");
  }
  if (err instanceof Anthropic.APIError) {
    console.error("[ai]", err.status, err.message);
    return new AssistantError("unavailable", `Claude API временно недоступен (${err.status ?? "ошибка"}). Попробуйте позже.`);
  }
  console.error("[ai]", err);
  return new AssistantError("unavailable", "Не удалось получить ответ AI-помощника.");
}

/**
 * Claude через Anthropic SDK. Если основная модель откажется отвечать по соображениям безопасности,
 * сервер Anthropic сам повторит запрос на рекомендованной резервной модели (fallbacks: "default").
 */
export async function askClaude(c: AiConnection, { system, user, effort, schema }: Parameters<LanguageModel["ask"]>[0]) {
  let res;
  try {
    res = await client(c).beta.messages.create({
      model: c.model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: schema ? { effort, format: { type: "json_schema", schema } } : { effort },
      system,
      messages: [{ role: "user", content: user }],
    });
  } catch (err) {
    throw toAssistantError(err);
  }
  if (res.stop_reason === "refusal") throw new AssistantError("refused", "Claude отказался отвечать на этот запрос. Попробуйте переформулировать или ответьте вручную.");
  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("")
    .trim();
  if (!text) throw new AssistantError("badResponse", "Claude вернул пустой ответ — попробуйте ещё раз.");
  return { text, usage: { input: res.usage.input_tokens, output: res.usage.output_tokens } };
}
