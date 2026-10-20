import { afterEach, describe, expect, it, vi } from "vitest";
import { AssistantError, DEFAULT_PRICES, costUsd, failureKindOf, parsePrices, readRoutePolicy, supportsServerFallback, type AiProvider, type RoutePolicy } from "@/modules/assistant/domain";
import { sellerModel, type SellerRoute } from "@/modules/assistant/application/SellerModel";
import type { LanguageModel } from "@/modules/assistant/application";
import { askClaude } from "@/modules/assistant/infrastructure/claude";
import { aiConnections } from "@/modules/assistant/infrastructure/connection";

// ─── прайс и политика ───────────────────────────────────────────────────────

describe("маршрутизация: прайс и политика из настроек", () => {
  it("политика по умолчанию: включена, Haiku по умолчанию, актуальные модели Claude, пороги и лимиты", () => {
    const p = readRoutePolicy({});
    expect(p).toMatchObject({ mode: "on", defaultTier: "haiku", models: { haiku: "claude-haiku-5-5", sonnet: "claude-sonnet-5-5", opus: "claude-opus-5-5" }, sonnetAt: 2, opusAt: 6, maxExtra: 2, budgetUsd: 0.5, dailyBudgetUsd: null });
    expect(readRoutePolicy({ "seller.route.budget": "0" }).budgetUsd).toBeNull();
  });

  it("настройки перекрывают значения по умолчанию; неверные — по умолчанию; порог Opus всегда выше порога Sonnet", () => {
    const p = readRoutePolicy({ "seller.route": "shadow", "seller.route.default": "sonnet", "seller.route.haiku": "claude-haiku-4-5", "seller.route.sonnetAt": "4", "seller.route.opusAt": "3", "seller.route.maxExtra": "9", "seller.route.budget": "0,5", "seller.route.dailyBudget": "abc" });
    expect(p).toMatchObject({ mode: "shadow", defaultTier: "sonnet", sonnetAt: 4, opusAt: 5, maxExtra: 4, budgetUsd: 0.5, dailyBudgetUsd: null });
    expect(p.models.haiku).toBe("claude-haiku-4-5");
    expect(readRoutePolicy({ "seller.route": "off" }).mode).toBe("off");
    expect(readRoutePolicy({ "seller.route": "что-то" }).mode).toBe("on");
  });

  it("стоимость считается по единому прайсу и учитывает кэш: чтение и запись", () => {
    // Haiku: 1000 × 0.1 + 200 × 0.5 + 10 000 × 0.01 + 2000 × 0.2 = 700 микродолларов.
    expect(costUsd({ input: 1000, output: 200, cacheRead: 10_000, cacheWrite: 2000 }, "claude-haiku-5-5", DEFAULT_PRICES)).toBeCloseTo(0.0007, 10);
    // Sonnet и Opus без кэша.
    expect(costUsd({ input: 1_000_000, output: 100_000 }, "claude-sonnet-5-5", DEFAULT_PRICES)).toBeCloseTo(3, 10);
    expect(costUsd({ input: 1_000_000, output: 100_000 }, "claude-opus-5-5", DEFAULT_PRICES)).toBeCloseTo(6, 10);
    // Модели нет в прайсе (запасной провайдер) — стоимость неизвестна, а не ноль.
    expect(costUsd({ input: 1000, output: 100 }, "deepseek-chat", DEFAULT_PRICES)).toBeNull();
  });

  it("прайс из настройки: новые модели и новые цены поверх значений по умолчанию; испорченный JSON — по умолчанию", () => {
    const prices = parsePrices('{"claude-haiku-5-5": {"input": 0.2, "output": 1}, "deepseek-chat": {"input": 0.27, "output": 1.1, "cacheRead": 0.07}}');
    expect(prices["claude-haiku-5-5"]).toEqual({ input: 0.2, output: 1, cacheRead: 0.02, cacheWrite: 0.4 });
    expect(prices["deepseek-chat"]).toMatchObject({ input: 0.27, cacheRead: 0.07 });
    expect(prices["claude-opus-5-5"]).toEqual(DEFAULT_PRICES["claude-opus-5-5"]);
    expect(parsePrices("{сломано")).toEqual(DEFAULT_PRICES);
  });

  it("серверный резерв на отказ — только у моделей, где он есть (у Haiku 5.5 его нет)", () => {
    expect(supportsServerFallback("claude-haiku-5-5")).toBe(false);
    expect(supportsServerFallback("claude-sonnet-5-5")).toBe(true);
    expect(supportsServerFallback("claude-opus-5-5")).toBe(true);
    expect(supportsServerFallback("claude-sonnet-4-6")).toBe(false);
  });
});

// ─── маршрут одного запроса ─────────────────────────────────────────────────

type Step = { text: string; cacheRead?: number; model?: string } | Error;
/** Модель-двойник: отвечает по сценарию, запоминает запросы. */
function fakeLm(provider: AiProvider, model: string, steps: Step[], configured = true) {
  const asked: Parameters<LanguageModel["ask"]>[0][] = [];
  const lm: LanguageModel = {
    configured: async () => configured,
    describe: async () => ({ provider, label: provider, model }),
    ask: async (req) => {
      asked.push(req);
      const s = steps.shift();
      if (!s) throw new AssistantError("unavailable", "сценарий кончился", ["server"]);
      if (s instanceof Error) throw s;
      return { text: s.text, usage: { input: 1000, output: 100, cacheRead: s.cacheRead ?? 0, cacheWrite: 0, model: s.model } };
    },
  };
  return { lm, asked };
}

const err = (kind: string, retryAfter: number | null = null) => new AssistantError(kind === "refused" ? "refused" : "unavailable", `сбой: ${kind}`, [kind, retryAfter]);

function router(o: { policy?: Partial<RoutePolicy>; claude?: Record<string, ReturnType<typeof fakeLm>>; fallbacks?: ReturnType<typeof fakeLm>[]; legacy?: ReturnType<typeof fakeLm> }) {
  const policy = { ...readRoutePolicy({}), ...o.policy };
  const sleeps: number[] = [];
  let now = 0;
  const route: SellerRoute = {
    policy: async () => policy,
    claude: (model) => (o.claude?.[model] ?? fakeLm("anthropic", model, [], false)).lm,
    fallbacks: async () => (o.fallbacks ?? []).map((f) => f.lm),
    legacy: (o.legacy ?? fakeLm("deepseek", "deepseek-chat", [])).lm,
  };
  const model = sellerModel(route, async () => ({ provider: "anthropic", apiKey: "", model: "", baseUrl: "" }), async () => null, {
    now: () => now,
    sleep: async (ms) => {
      sleeps.push(ms);
      now += ms;
    },
  });
  return { model, sleeps };
}

const REQ = { system: "Ты — продажник", user: "Клиент: сколько стоит?", schema: { type: "object" }, timeoutMs: 30_000, cachePrefix: "Ты" };

describe("маршрутизатор продажника: Claude основной, остальные — запасные", () => {
  it("уровень, который назвал бот: запрос уходит модели этого уровня; в ответе — кто ответил, токены с кэшем и стоимость", async () => {
    const haiku = fakeLm("anthropic", "claude-haiku-5-5", [{ text: "{}", cacheRead: 5000 }]);
    const sonnet = fakeLm("anthropic", "claude-sonnet-5-5", [{ text: "{}" }]);
    const { model } = router({ claude: { "claude-haiku-5-5": haiku, "claude-sonnet-5-5": sonnet } });
    const a = await model.complete({ ...REQ });
    expect(a.served).toMatchObject({ mode: "on", provider: "anthropic", model: "claude-haiku-5-5", tier: "haiku", wanted: "haiku", fallback: false, usage: { input: 1000, output: 100, cacheRead: 5000, cacheWrite: 0 }, attempts: [] });
    // 1000 × 0.1 + 100 × 0.5 + 5000 × 0.01 = 200 микродолларов.
    expect(a.served.costUsd).toBeCloseTo(0.0002, 10);
    expect(haiku.asked[0]).toMatchObject({ system: REQ.system, user: REQ.user, cachePrefix: "Ты", effort: "medium" });
    const b = await model.complete({ ...REQ, tier: "sonnet" });
    expect(b.served).toMatchObject({ model: "claude-sonnet-5-5", tier: "sonnet" });
  });

  it("rate limit — одна повторная попытка той же модели после паузы (retry-after), потом ответ", async () => {
    const haiku = fakeLm("anthropic", "claude-haiku-5-5", [err("rate_limit", 2), { text: "{}" }]);
    const { model, sleeps } = router({ claude: { "claude-haiku-5-5": haiku } });
    const a = await model.complete(REQ);
    expect(sleeps).toEqual([2000]);
    expect(haiku.asked).toHaveLength(2);
    expect(a.served.attempts).toEqual([expect.objectContaining({ model: "claude-haiku-5-5", kind: "rate_limit" })]);
  });

  it("долгий retry-after и таймаут — без ожидания, сразу к запасному провайдеру", async () => {
    const haiku = fakeLm("anthropic", "claude-haiku-5-5", [err("rate_limit", 30)]);
    const deepseek = fakeLm("deepseek", "deepseek-chat", [{ text: "{}" }]);
    const r1 = router({ claude: { "claude-haiku-5-5": haiku }, fallbacks: [deepseek] });
    const a = await r1.model.complete(REQ);
    expect(r1.sleeps).toEqual([]);
    expect(a.served).toMatchObject({ provider: "deepseek", model: "deepseek-chat", tier: null, fallback: true, costUsd: null });

    const slow = fakeLm("anthropic", "claude-haiku-5-5", [err("timeout")]);
    const openai = fakeLm("openai", "gpt-5", [{ text: "{}" }]);
    const r2 = router({ claude: { "claude-haiku-5-5": slow }, fallbacks: [openai] });
    expect((await r2.model.complete(REQ)).served).toMatchObject({ provider: "openai", fallback: true });
    expect(slow.asked).toHaveLength(1);
  });

  it("временный сбой дважды подряд — один повтор, затем запасной; ограниченное число попыток", async () => {
    const haiku = fakeLm("anthropic", "claude-haiku-5-5", [err("overloaded"), err("overloaded"), { text: "лишнее" }]);
    const deepseek = fakeLm("deepseek", "deepseek-chat", [{ text: "{}" }]);
    const { model, sleeps } = router({ claude: { "claude-haiku-5-5": haiku }, fallbacks: [deepseek] });
    const a = await model.complete(REQ);
    expect(haiku.asked).toHaveLength(2);
    expect(sleeps).toHaveLength(1);
    expect(a.served.attempts.map((x) => x.kind)).toEqual(["overloaded", "overloaded"]);
  });

  it("Haiku отказался (у него нет серверного резерва) — тот же запрос на Sonnet, до запасных провайдеров", async () => {
    const haiku = fakeLm("anthropic", "claude-haiku-5-5", [err("refused")]);
    const sonnet = fakeLm("anthropic", "claude-sonnet-5-5", [{ text: "{}" }]);
    const deepseek = fakeLm("deepseek", "deepseek-chat", [{ text: "{}" }]);
    const { model } = router({ claude: { "claude-haiku-5-5": haiku, "claude-sonnet-5-5": sonnet }, fallbacks: [deepseek] });
    const a = await model.complete(REQ);
    expect(a.served).toMatchObject({ model: "claude-sonnet-5-5", tier: "sonnet", fallback: false });
    expect(sonnet.asked[0]).toMatchObject({ system: REQ.system, user: REQ.user });
    expect(deepseek.asked).toHaveLength(0);
  });

  it("переполнено окно контекста — ошибка боту (он сократит переписку), запасные не пробуются", async () => {
    const haiku = fakeLm("anthropic", "claude-haiku-5-5", [err("context")]);
    const deepseek = fakeLm("deepseek", "deepseek-chat", [{ text: "{}" }]);
    const { model } = router({ claude: { "claude-haiku-5-5": haiku }, fallbacks: [deepseek] });
    await expect(model.complete(REQ)).rejects.toMatchObject({ kind: "context", attempts: [expect.objectContaining({ kind: "context" })] });
    expect(deepseek.asked).toHaveLength(0);
  });

  it("нет ключа Claude — сразу запасной; ничего не подключено — понятная ошибка", async () => {
    const deepseek = fakeLm("deepseek", "deepseek-chat", [{ text: "{}" }]);
    const r = router({ fallbacks: [deepseek] });
    expect(await r.model.configured()).toBe(true);
    expect((await r.model.describe()).provider).toBe("deepseek");
    expect((await r.model.complete(REQ)).served).toMatchObject({ provider: "deepseek", fallback: true, attempts: [expect.objectContaining({ kind: "not_configured", tier: "haiku" })] });

    const none = router({});
    expect(await none.model.configured()).toBe(false);
    await expect(none.model.complete(REQ)).rejects.toMatchObject({ kind: "not_configured" });
  });

  it("все маршруты не ответили — ошибка со всеми попытками; модели не переключаются бесконечно", async () => {
    const haiku = fakeLm("anthropic", "claude-haiku-5-5", [err("server"), err("server"), err("server")]);
    const deepseek = fakeLm("deepseek", "deepseek-chat", [err("auth")]);
    const { model } = router({ claude: { "claude-haiku-5-5": haiku }, fallbacks: [deepseek] });
    await expect(model.complete(REQ)).rejects.toMatchObject({ kind: "auth", attempts: [expect.objectContaining({ kind: "server" }), expect.objectContaining({ kind: "server" }), expect.objectContaining({ provider: "deepseek", kind: "auth" })] });
    expect(haiku.asked).toHaveLength(2);
  });

  it("режим shadow: отвечает уровень по умолчанию, уровень бота только записан", async () => {
    const haiku = fakeLm("anthropic", "claude-haiku-5-5", [{ text: "{}" }]);
    const { model } = router({ policy: { mode: "shadow" }, claude: { "claude-haiku-5-5": haiku } });
    expect((await model.complete({ ...REQ, tier: "opus" })).served).toMatchObject({ mode: "shadow", tier: "haiku", wanted: "opus" });
  });

  it("режим off: прежняя одна модель продажника, без Claude-уровней и без запасных", async () => {
    const legacy = fakeLm("deepseek", "deepseek-reasoner", [err("server")]);
    const haiku = fakeLm("anthropic", "claude-haiku-5-5", [{ text: "{}" }]);
    const openai = fakeLm("openai", "gpt-5", [{ text: "{}" }]);
    const { model } = router({ policy: { mode: "off" }, claude: { "claude-haiku-5-5": haiku }, fallbacks: [openai], legacy });
    expect(await model.describe()).toMatchObject({ provider: "deepseek", model: "deepseek-reasoner" });
    await expect(model.complete({ ...REQ, tier: "sonnet" })).rejects.toBeTruthy();
    expect(haiku.asked).toHaveLength(0);
    expect(openai.asked).toHaveLength(0);
  });

  it("серверный резерв Anthropic ответил другой моделью — стоимость по фактической модели", async () => {
    const sonnet = fakeLm("anthropic", "claude-sonnet-5-5", [{ text: "{}", model: "claude-opus-5-5" }]);
    const { model } = router({ claude: { "claude-sonnet-5-5": sonnet } });
    const a = await model.complete({ ...REQ, tier: "sonnet" });
    expect(a.served.model).toBe("claude-opus-5-5");
    expect(a.served.costUsd).toBeCloseTo((1000 * 4 + 100 * 20) / 1e6, 10);
  });

  it("вид сбоя читается из ошибки провайдера", () => {
    expect(failureKindOf(err("rate_limit"))).toBe("rate_limit");
    expect(failureKindOf(new AssistantError("refused", "нет"))).toBe("refused");
    expect(failureKindOf(new AssistantError("notConfigured", "нет ключа"))).toBe("not_configured");
    expect(failureKindOf(new Error("что-то"))).toBe("server");
  });
});

// ─── адаптер Anthropic ──────────────────────────────────────────────────────

let seq = 0;
const conn = (model: string) => ({ provider: "anthropic" as const, apiKey: `sk-ant-test-${++seq}`, model, baseUrl: "https://api.anthropic.com" });
const message = (p: Record<string, unknown> = {}) => ({
  id: "msg_1",
  type: "message",
  role: "assistant",
  model: "claude-haiku-5-5",
  content: [{ type: "text", text: '{"ok":true}' }],
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: { input_tokens: 120, output_tokens: 30, cache_read_input_tokens: 4000, cache_creation_input_tokens: 0 },
  ...p,
});

function mockAnthropic(...responses: Response[]) {
  const bodies: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return responses.shift() ?? new Response(JSON.stringify(message()), { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
  return bodies;
}
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

afterEach(() => vi.unstubAllGlobals());

describe("Claude через Anthropic SDK: уровни маршрута", () => {
  const sys = "x".repeat(300);
  it("Haiku — без серверного резерва; токены кэша и фактическая модель — в usage", async () => {
    const bodies = mockAnthropic(json(message()));
    const res = await askClaude(conn("claude-haiku-5-5"), { system: sys, user: "u", effort: "medium", schema: { type: "object" }, timeoutMs: 5000, cachePrefix: sys });
    expect(bodies[0].model).toBe("claude-haiku-5-5");
    expect(bodies[0]).not.toHaveProperty("fallbacks");
    expect(res.usage).toEqual({ input: 120, output: 30, cacheRead: 4000, cacheWrite: 0, model: "claude-haiku-5-5" });
  });

  it("Sonnet и Opus — с серверным резервом на отказ (fallbacks: default)", async () => {
    const bodies = mockAnthropic(json(message({ model: "claude-sonnet-5-5" })), json(message({ model: "claude-opus-5-5" })));
    await askClaude(conn("claude-sonnet-5-5"), { system: "s", user: "u", effort: "medium", timeoutMs: 5000 });
    await askClaude(conn("claude-opus-5-5"), { system: "s", user: "u", effort: "medium", timeoutMs: 5000 });
    expect(bodies.map((b) => b.fallbacks)).toEqual(["default", "default"]);
  });

  it("ошибки API → вид сбоя для маршрута: 429 с retry-after, 529, переполненное окно, отказ", async () => {
    mockAnthropic(
      json({ type: "error", error: { type: "rate_limit_error", message: "rate limited" } }, 429, { "retry-after": "2" }),
      json({ type: "error", error: { type: "overloaded_error", message: "overloaded" } }, 529),
      json({ type: "error", error: { type: "invalid_request_error", message: "prompt is too long: 1200000 tokens > 1000000 maximum" } }, 400),
      json(message({ stop_reason: "refusal", content: [] })),
    );
    const req = { system: "s", user: "u", effort: "medium" as const, timeoutMs: 5000 };
    const kinds: unknown[] = [];
    for (let i = 0; i < 4; i++) {
      await askClaude(conn("claude-haiku-5-5"), req).catch((e: unknown) => kinds.push([(e as AssistantError).params[0], (e as AssistantError).params[1] ?? null]));
    }
    expect(kinds).toEqual([
      ["rate_limit", 2],
      ["overloaded", null],
      ["context", null],
      ["refused", null],
    ]);
  });
});

// ─── запасные провайдеры из настроек ────────────────────────────────────────


function settingsOf(values: Record<string, string>) {
  return {
    get: async (k: string) => values[k] ?? "",
    getMany: async (keys: readonly string[]) => Object.fromEntries(keys.map((k) => [k, values[k] ?? ""])),
  } as unknown as Parameters<typeof aiConnections>[0];
}

describe("запасные провайдеры продажника", () => {
  it("по умолчанию — прежний провайдер продажника (не Claude) со своей моделью: данные уходят только туда, куда и раньше", async () => {
    const ai = aiConnections(settingsOf({ "ai.provider": "anthropic", "seller.provider": "deepseek", "seller.model": "deepseek-reasoner", "ai.deepseek.apiKey": "sk-d" }));
    const list = await ai.sellerFallbacks();
    expect(list.map((f) => f.provider)).toEqual(["deepseek"]);
    expect(await list[0].connection()).toMatchObject({ provider: "deepseek", model: "deepseek-reasoner", apiKey: "sk-d" });
  });

  it("прежний провайдер — Claude: запасных нет; Claude в списке запасных не бывает; порядок — как в настройке", async () => {
    expect(await aiConnections(settingsOf({ "ai.provider": "anthropic" })).sellerFallbacks()).toEqual([]);
    const ai = aiConnections(settingsOf({ "seller.fallbacks": "openai, anthropic,deepseek,openai,нет-такого", "seller.provider": "deepseek", "seller.model": "deepseek-reasoner" }));
    const list = await ai.sellerFallbacks();
    expect(list.map((f) => f.provider)).toEqual(["openai", "deepseek"]);
    expect((await list[0].connection()).model).toBe("gpt-5");
    expect((await list[1].connection()).model).toBe("deepseek-reasoner");
  });

  it("уровни Claude — с ключом и адресом Anthropic и моделью уровня; политика — из настроек", async () => {
    const ai = aiConnections(settingsOf({ "ai.apiKey": "sk-ant", "seller.route.sonnet": "claude-sonnet-5", "seller.route": "shadow" }));
    expect(await ai.claude("claude-haiku-5-5")()).toMatchObject({ provider: "anthropic", apiKey: "sk-ant", model: "claude-haiku-5-5", baseUrl: "https://api.anthropic.com", enabled: true });
    expect(await ai.sellerPolicy()).toMatchObject({ mode: "shadow", models: { sonnet: "claude-sonnet-5" } });
  });
});
