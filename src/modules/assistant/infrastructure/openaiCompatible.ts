import "server-only";
import type { LanguageModel } from "../application";
import { AssistantError, aiProviders, type AiConnection } from "../domain";

type Request = Parameters<LanguageModel["ask"]>[0];

interface ChatResponse {
  choices?: { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const RETRY_STATUSES = new Set([408, 409, 429, 500, 502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Модели OpenAI с рассуждением (GPT-5, o-серия) принимают reasoning_effort; остальные его отвергают. */
const supportsReasoningEffort = (c: AiConnection) => c.provider === "openai" && /^(gpt-5|o\d)/.test(c.model);

/** Структурированный ответ: OpenAI — строгая JSON-схема; остальные — JSON-режим и схема в инструкции. */
function body(c: AiConnection, req: Request, structured: boolean) {
  const strictSchema = structured && c.provider === "openai";
  const system = req.schema && !strictSchema ? `${req.system}\n\nОтветь только JSON-объектом по этой JSON-схеме, без пояснений и без markdown:\n${JSON.stringify(req.schema)}` : req.system;
  return {
    model: c.model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: req.user },
    ],
    ...(c.provider === "openai" ? { max_completion_tokens: 16000 } : { max_tokens: 8000 }),
    ...(supportsReasoningEffort(c) ? { reasoning_effort: req.effort } : {}),
    ...(req.schema && structured
      ? { response_format: strictSchema ? { type: "json_schema", json_schema: { name: "answer", schema: req.schema, strict: true } } : { type: "json_object" } }
      : {}),
  };
}

async function post(c: AiConnection, payload: unknown): Promise<ChatResponse> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(`${c.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(c.apiKey ? { Authorization: `Bearer ${c.apiKey}` } : {}) },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(90_000),
      });
      const json = (await res.json().catch(() => ({}))) as ChatResponse;
      if (res.ok) return json;
      if (attempt < 2 && RETRY_STATUSES.has(res.status)) {
        await sleep(1000 * 3 ** attempt);
        continue;
      }
      throw new HttpError(res.status, json.error?.message ?? res.statusText);
    } catch (err) {
      if (err instanceof HttpError) throw err;
      if (attempt < 2) {
        await sleep(1000 * 3 ** attempt);
        continue;
      }
      throw err;
    }
  }
}

function toAssistantError(c: AiConnection, err: unknown): Error {
  const name = aiProviders[c.provider].label === "AI" ? "AI-сервис" : aiProviders[c.provider].label;
  if (err instanceof HttpError) {
    if (err.status === 401) return new AssistantError("notConfigured", `Ключ ${name} неверный или отозван — проверьте его в «Интеграциях».`);
    if (err.status === 402) return new AssistantError("notConfigured", `На счёте ${name} закончились средства — пополните баланс у провайдера.`);
    if (err.status === 403) return new AssistantError("notConfigured", `У ключа ${name} нет доступа к модели ${c.model}.`);
    if (err.status === 404) return new AssistantError("notConfigured", `Модель «${c.model}» или адрес API не найдены — проверьте их в «Интеграциях».`);
    if (err.status === 429) return new AssistantError("unavailable", `Слишком много запросов к ${name} — попробуйте через минуту.`);
    console.error("[ai]", c.provider, err.status, err.message);
    if (err.status === 400 || err.status === 422) return new AssistantError("unavailable", `${name} отклонил запрос. Подробности — в логах сервера.`);
    return new AssistantError("unavailable", `${name} временно недоступен (${err.status}). Попробуйте позже.`);
  }
  console.error("[ai]", c.provider, err);
  return new AssistantError("unavailable", `Нет связи с ${name}. Попробуйте позже.`);
}

/** Текст ответа без рассуждений локальных моделей (<think>…</think>) и markdown-обёртки JSON. */
export function cleanModelText(text: string, json: boolean) {
  let t = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  if (json) t = t.replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, "$1").trim();
  return t;
}

/**
 * ChatGPT, DeepSeek и любой сервер с OpenAI-совместимым Chat Completions API (OpenRouter, Qwen, vLLM, Ollama).
 * Если сервер не поддерживает структурированный ответ (400), запрос повторяется с JSON-схемой только в инструкции.
 */
export async function askOpenAiCompatible(c: AiConnection, req: Request) {
  let res: ChatResponse;
  try {
    try {
      res = await post(c, body(c, req, true));
    } catch (err) {
      if (!(req.schema && err instanceof HttpError && err.status === 400)) throw err;
      res = await post(c, body(c, req, false));
    }
  } catch (err) {
    throw toAssistantError(c, err);
  }
  const choice = res.choices?.[0];
  if (choice?.message?.refusal || choice?.finish_reason === "content_filter") throw new AssistantError("refused", "Модель отказалась отвечать на этот запрос. Попробуйте переформулировать или ответьте вручную.");
  const text = cleanModelText(choice?.message?.content ?? "", !!req.schema);
  if (!text) throw new AssistantError("badResponse", "Модель вернула пустой ответ — попробуйте ещё раз.");
  return { text, usage: { input: res.usage?.prompt_tokens ?? 0, output: res.usage?.completion_tokens ?? 0 } };
}
