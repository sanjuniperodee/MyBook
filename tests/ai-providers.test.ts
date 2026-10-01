import { afterEach, describe, expect, it, vi } from "vitest";
import { askOpenAiCompatible, cleanModelText } from "@/modules/assistant/infrastructure/openaiCompatible";
import { aiProviders, connectionReady, type AiConnection } from "@/modules/assistant/domain";

const schema = { type: "object", properties: { summary: { type: "string" } }, required: ["summary"], additionalProperties: false };
const ok = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }], usage: { prompt_tokens: 11, completion_tokens: 7 } }), { status: 200 });
const conn = (provider: AiConnection["provider"], extra: Partial<AiConnection> = {}): AiConnection => ({
  provider,
  apiKey: "sk-test",
  model: aiProviders[provider].defaultModel || "my-model",
  baseUrl: aiProviders[provider].defaultBaseUrl || "http://llm.local/v1",
  ...extra,
});

function mockFetch(...responses: Response[]) {
  const calls: { url: string; body: Record<string, unknown>; auth: string | null }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)), auth: new Headers(init.headers).get("authorization") });
      return responses.shift() ?? ok("");
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("OpenAI-совместимые провайдеры", () => {
  it("ChatGPT: строгая JSON-схема, reasoning_effort и max_completion_tokens", async () => {
    const calls = mockFetch(ok('{"summary":"ок"}'));
    const res = await askOpenAiCompatible(conn("openai"), { system: "sys", user: "u", effort: "medium", schema });
    expect(res).toEqual({ text: '{"summary":"ок"}', usage: { input: 11, output: 7 } });
    expect(calls[0].url).toBe("https://api.openai.com/v1/chat/completions");
    expect(calls[0].auth).toBe("Bearer sk-test");
    expect(calls[0].body).toMatchObject({ model: "gpt-5", reasoning_effort: "medium", max_completion_tokens: 16000, response_format: { type: "json_schema", json_schema: { strict: true, schema } } });
    expect((calls[0].body.messages as { content: string }[])[0].content).toBe("sys");
  });

  it("DeepSeek: JSON-режим, схема в инструкции, без reasoning_effort", async () => {
    const calls = mockFetch(ok('```json\n{"summary":"ок"}\n```'));
    const res = await askOpenAiCompatible(conn("deepseek"), { system: "sys", user: "u", effort: "low", schema });
    expect(res.text).toBe('{"summary":"ок"}');
    expect(calls[0].url).toBe("https://api.deepseek.com/chat/completions");
    expect(calls[0].body).toMatchObject({ model: "deepseek-chat", max_tokens: 8000, response_format: { type: "json_object" } });
    expect(calls[0].body).not.toHaveProperty("reasoning_effort");
    expect((calls[0].body.messages as { content: string }[])[0].content).toContain('"summary"');
  });

  it("свой сервер без поддержки response_format: повтор без него", async () => {
    const calls = mockFetch(new Response(JSON.stringify({ error: { message: "response_format not supported" } }), { status: 400 }), ok('<think>хм</think>{"summary":"ок"}'));
    const res = await askOpenAiCompatible(conn("custom", { apiKey: "" }), { system: "sys", user: "u", effort: "low", schema });
    expect(res.text).toBe('{"summary":"ок"}');
    expect(calls).toHaveLength(2);
    expect(calls[1].body).not.toHaveProperty("response_format");
    expect(calls[0].auth).toBeNull();
  });

  it("неверный ключ — понятная ошибка «не подключён»", async () => {
    mockFetch(new Response(JSON.stringify({ error: { message: "invalid key" } }), { status: 401 }));
    await expect(askOpenAiCompatible(conn("deepseek"), { system: "s", user: "u", effort: "low" })).rejects.toMatchObject({ code: "notConfigured", message: expect.stringContaining("DeepSeek") });
  });

  it("отказ модели", async () => {
    mockFetch(new Response(JSON.stringify({ choices: [{ message: { content: null, refusal: "no" }, finish_reason: "stop" }] }), { status: 200 }));
    await expect(askOpenAiCompatible(conn("openai"), { system: "s", user: "u", effort: "low" })).rejects.toMatchObject({ code: "refused" });
  });

  it("готовность подключения и очистка ответа", () => {
    expect(connectionReady(conn("openai", { apiKey: "" }))).toBe(false);
    expect(connectionReady(conn("custom", { apiKey: "" }))).toBe(true);
    expect(connectionReady(conn("custom", { model: "" }))).toBe(false);
    expect(cleanModelText("```\n{\"a\":1}\n```", true)).toBe('{"a":1}');
    expect(cleanModelText("Привет", false)).toBe("Привет");
  });
});
