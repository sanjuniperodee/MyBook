import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { LanguageModel } from "../application";
import { AssistantError, supportsServerFallback, systemBlocks, type AiConnection } from "../domain";
import type { MediaPart, MediaRecognition } from "../application/SellerModel";

let cached: { sig: string; client: Anthropic } | null = null;

function client(c: AiConnection) {
  const sig = `${c.apiKey}|${c.baseUrl}`;
  if (cached?.sig !== sig) cached = { sig, client: new Anthropic({ apiKey: c.apiKey, baseURL: c.baseUrl, maxRetries: 2, timeout: 90_000 }) };
  return cached.client;
}

/** retry-after из ответа (секунды); нет заголовка — null. */
function retryAfter(err: InstanceType<typeof Anthropic.APIError>): number | null {
  const v = err.headers?.get("retry-after");
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Ошибка SDK → AssistantError с текстом для менеджера и видом сбоя (params: [вид, retry-after]) для маршрутизации продажника. */
function toAssistantError(err: unknown): Error {
  if (AssistantError.is(err)) return err;
  if (err instanceof Anthropic.AuthenticationError) return new AssistantError("notConfigured", "Ключ Claude API неверный или отозван — проверьте его в «Интеграциях».", ["auth"]);
  if (err instanceof Anthropic.PermissionDeniedError) return new AssistantError("notConfigured", "У ключа Claude API нет доступа к модели.", ["auth"]);
  if (err instanceof Anthropic.NotFoundError) return new AssistantError("notConfigured", "Модель Claude не найдена — проверьте её название в «Интеграциях».", ["not_found"]);
  if (err instanceof Anthropic.RateLimitError) return new AssistantError("unavailable", "Слишком много запросов к Claude — попробуйте через минуту.", ["rate_limit", retryAfter(err)]);
  if (err instanceof Anthropic.APIConnectionTimeoutError) return new AssistantError("unavailable", "Claude не ответил вовремя. Попробуйте позже.", ["timeout"]);
  if (err instanceof Anthropic.APIConnectionError) return new AssistantError("unavailable", "Нет связи с Claude API. Попробуйте позже.", ["connection"]);
  if (err instanceof Anthropic.BadRequestError) {
    console.error("[ai] bad request", err.message);
    // Запрос длиннее окна контекста модели: бот повторит с сокращённой перепиской.
    const context = /prompt is too long|context (?:window|length)|too many tokens/i.test(err.message);
    return new AssistantError("unavailable", context ? "Переписка слишком длинная для модели Claude." : "Claude API отклонил запрос. Подробности — в логах сервера.", [context ? "context" : "bad_request"]);
  }
  if (err instanceof Anthropic.APIError) {
    console.error("[ai]", err.status, err.message);
    return new AssistantError("unavailable", `Claude API временно недоступен (${err.status ?? "ошибка"}). Попробуйте позже.`, [err.status === 529 ? "overloaded" : "server", retryAfter(err)]);
  }
  console.error("[ai]", err);
  return new AssistantError("unavailable", "Не удалось получить ответ AI-помощника.", ["server"]);
}

/**
 * Claude через Anthropic SDK. Если основная модель откажется отвечать по соображениям безопасности,
 * сервер Anthropic сам повторит запрос на рекомендованной резервной модели (fallbacks: "default") — у моделей, где он
 * есть (у Haiku 5.5 серверного резерва нет: отказ Haiku поднимает ход на Sonnet маршрутизатор продажника).
 * Стабильное начало инструкции (cachePrefix: факты, правила и примеры продажника — одни на все беседы) уходит отдельным
 * блоком с меткой кэша на час: повторные ходы читают его из кэша, а не платят за него заново.
 */
export async function askClaude(c: AiConnection, { system, user, effort, schema, timeoutMs, cachePrefix, cacheTtl = "1h" }: Parameters<LanguageModel["ask"]>[0]) {
  const blocks = systemBlocks(system, cachePrefix);
  let res;
  try {
    res = await client(c).beta.messages.create(
      {
        model: c.model,
        max_tokens: 16000,
        ...(supportsServerFallback(c.model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        output_config: schema ? { effort, format: { type: "json_schema", schema } } : { effort },
        system: blocks.some((b) => b.cached) ? blocks.map((b) => (b.cached ? { type: "text" as const, text: b.text, cache_control: { type: "ephemeral" as const, ttl: cacheTtl } } : { type: "text" as const, text: b.text })) : system,
        messages: [{ role: "user", content: user }],
      },
      // Быстрый запрос (бот в чате): свой таймаут и без повторов.
      timeoutMs ? { timeout: timeoutMs, maxRetries: 0 } : undefined,
    );
  } catch (err) {
    throw toAssistantError(err);
  }
  if (res.stop_reason === "refusal") throw new AssistantError("refused", "Claude отказался отвечать на этот запрос. Попробуйте переформулировать или ответьте вручную.", ["refused"]);
  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("")
    .trim();
  if (!text) throw new AssistantError("badResponse", "Claude вернул пустой ответ — попробуйте ещё раз.", ["empty"]);
  // input_tokens — только некэшированный остаток; чтение и запись кэша тарифицируются отдельно. model — кто ответил
  // (после серверного резерва — резервная модель).
  return {
    text,
    usage: { input: res.usage.input_tokens, output: res.usage.output_tokens, cacheRead: res.usage.cache_read_input_tokens ?? 0, cacheWrite: res.usage.cache_creation_input_tokens ?? 0, thinking: res.usage.output_tokens_details?.thinking_tokens ?? 0, model: res.model || c.model },
  };
}

/**
 * Claude видит картинки (несколько полос длинного скриншота — одним запросом) и PDF (документ целиком: текст, таблицы,
 * сканы); аудио не принимает — «не умеет». Токены — в ответе: стоимость распознавания идёт в расходы беседы.
 */
export async function askClaudeMedia(c: AiConnection, input: { system: string; parts: MediaPart[]; timeoutMs: number }): Promise<MediaRecognition | null> {
  if (input.parts.some((p) => p.kind !== "image" && p.kind !== "pdf")) return { unsupported: true };
  const mimeOf = (m: string): "image/jpeg" | "image/png" | "image/gif" | "image/webp" => (/png/i.test(m) ? "image/png" : /gif/i.test(m) ? "image/gif" : /webp/i.test(m) ? "image/webp" : "image/jpeg");
  const content = input.parts.map((p) =>
    p.kind === "pdf"
      ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: p.data } }
      : { type: "image" as const, source: { type: "base64" as const, media_type: mimeOf(p.mime), data: p.data } },
  );
  const res = await client(c)
    .messages.create({ model: c.model, max_tokens: 2000, system: input.system, messages: [{ role: "user", content }] }, { timeout: input.timeoutMs, maxRetries: 1 })
    .catch((err: unknown) => (err instanceof Anthropic.BadRequestError ? ("unsupported" as const) : null));
  if (res === "unsupported") return { unsupported: true };
  if (!res || res.stop_reason === "refusal") return res ? { unsupported: true, reason: "Claude отказался разбирать вложение" } : null;
  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("")
    .trim();
  return text ? { text, usage: { input: res.usage.input_tokens, output: res.usage.output_tokens, cacheRead: res.usage.cache_read_input_tokens ?? 0, cacheWrite: res.usage.cache_creation_input_tokens ?? 0, thinking: res.usage.output_tokens_details?.thinking_tokens ?? 0, model: res.model || c.model } } : null;
}
