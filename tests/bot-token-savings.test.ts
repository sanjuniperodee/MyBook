import { describe, expect, it } from "vitest";
import { cacheTtlAdvice, defaultBotConfig, explicitDate, llmMetrics, obviouslyNeedsReply, readBotTrace, type BotConfig } from "@/modules/messaging/domain";
import { BOT_PAUSE_MS, TRIAGE_DELAY_MS, type BotSellerModel, type RoutePolicyView } from "@/modules/messaging/application";
import { DEFAULT_PRICES, costUsd, readRoutePolicy } from "@/modules/assistant/domain";
import { sellerModel } from "@/modules/assistant/application/SellerModel";
import type { LanguageModel } from "@/modules/assistant/application";
import { BOT_CONFIG, inbound, setup } from "./doubles/botHarness";

/** Экономия токенов: запросы, которые не меняют результата, не делаются; расход рассуждения и кэша — в статистике. */

describe("«ждёт ли клиент ответа» — модель спрашиваем только про короткие реакции", () => {
  it.each(["Сколько стоит?", "А доставка в Астану есть", "Здравствуйте", "Позвоните мне", "Хочу книгу маме", "Дорого", "Кітап қанша тұрады?", "x".repeat(130)])("ответ заведомо нужен: «%s»", (text) => {
    expect(obviouslyNeedsReply(text)).toBe(true);
  });
  it.each(["Аха", "Спасибо", "Ок, понятно", "Иә түсінікті", "Рахмет", "👍"])("может быть не нужен — решает модель: «%s»", (text) => {
    expect(obviouslyNeedsReply(text)).toBe(false);
  });

  it("в чате, который бот не ведёт: на вопрос клиента модель не вызывается, на «Аха» — вызывается", async () => {
    const asked: string[] = [];
    const ans = JSON.stringify({ summary: "", language: "ru", stage: "discovery", action: "reply", reply: "Черновик", handoff_reason: "none", fields: {}, event_date: "", plan: "unknown", asked_to_order: false, agreed: false, agreed_quote: "" });
    const m: BotSellerModel = { configured: async () => true, complete: async (r) => (asked.push(r.user), { text: ans, usage: { input: 1, output: 1 } }) };
    const config: BotConfig = { ...BOT_CONFIG, sell: { ...defaultBotConfig.sell, on: true, engine: "ai", takeover: false } };
    const t = setup({ bot: "always", config, seller: m });
    await t.service.ingest(inbound({ text: "Здравствуйте, хочу книгу маме", at: t.deps.clock.now() }));
    await t.advance(BOT_PAUSE_MS + 1);
    await t.service.send(t.conv().id, "Здравствуйте! Подскажу сам", "u1");
    asked.length = 0;
    await t.service.ingest(inbound({ text: "А сколько стоит печатная?", at: t.deps.clock.now() }));
    await t.advance(TRIAGE_DELAY_MS + 1000);
    expect(asked).toHaveLength(0);
    await t.service.ingest(inbound({ text: "Аха", at: t.deps.clock.now() }));
    await t.advance(TRIAGE_DELAY_MS + 1000);
    expect(asked).toHaveLength(1);
  });
});

describe("срок к дате — в первом запросе, если дата явно названа", () => {
  const now = new Date("2026-10-20T06:00:00Z");
  it("явные даты — да; относительные («завтра», «в субботу») и числа без месяца — нет", () => {
    expect(explicitDate("Нужна к 20 ноября", now, "Asia/Almaty")).toBe("2026-11-20");
    expect(explicitDate("до 20.11 успеете?", now, "Asia/Almaty")).toBe("2026-11-20");
    expect(explicitDate("қарашаның 20-сы", now, "Asia/Almaty")).toBe("2026-11-20");
    expect(explicitDate("Напишу завтра", now, "Asia/Almaty")).toBeNull();
    expect(explicitDate("в субботу юбилей", now, "Asia/Almaty")).toBeNull();
    expect(explicitDate("у меня 2 детей", now, "Asia/Almaty")).toBeNull();
  });
});

describe("глубина рассуждения по уровням и учёт рассуждения", () => {
  it("effort из настроек уходит модели своего уровня; по умолчанию — medium, как раньше", async () => {
    const asked: { effort: string; model: string }[] = [];
    const lm = (model: string): LanguageModel => ({ configured: async () => true, describe: async () => ({ provider: "anthropic", label: "Claude", model }), ask: async (r) => (asked.push({ effort: r.effort, model }), { text: "{}", usage: { input: 100, output: 300, thinking: 200, model } }) });
    const policy = readRoutePolicy({ "seller.route.effort.haiku": "low" });
    expect(policy.effort).toEqual({ haiku: "low", sonnet: "medium", opus: "medium" });
    expect(readRoutePolicy({}).effort).toEqual({ haiku: "medium", sonnet: "medium", opus: "medium" });
    const m = sellerModel({ policy: async () => policy, claude: lm, fallbacks: async () => [], legacy: lm("x") }, async () => ({ provider: "anthropic", apiKey: "", model: "", baseUrl: "" }), async () => null);
    const a = await m.complete({ system: "s", user: "u", schema: {}, timeoutMs: 5000 });
    await m.complete({ system: "s", user: "u", schema: {}, timeoutMs: 5000, tier: "sonnet" });
    expect(asked).toEqual([
      { effort: "low", model: "claude-haiku-5-5" },
      { effort: "medium", model: "claude-sonnet-5-5" },
    ]);
    expect(a.served.usage.thinking).toBe(200);
  });

  it("прайс Sonnet 5.5: чтение кэша — 0.05× входа ($0.10 за 1M)", () => {
    expect(DEFAULT_PRICES["claude-sonnet-5-5"].cacheRead).toBe(0.1);
  });

  it("статистика: доля входа из кэша, доля рассуждения в выходе, расходы по уровням", () => {
    const m = llmMetrics(
      [{ chosen: "haiku", final: "haiku", mode: "on", turns: 10, escalations: 0, costUsd: 0.01 }],
      [
        { tier: "haiku", provider: "anthropic", model: "claude-haiku-5-5", calls: 10, failed: 0, fallback: 0, retries: 0, input: 2000, output: 4000, cacheRead: 8000, cacheWrite: 0, thinking: 3000, costUsd: 0.004, avgMs: 900 },
        { tier: "sonnet", provider: "anthropic", model: "claude-sonnet-5-5", calls: 1, failed: 0, fallback: 0, retries: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, thinking: 0, costUsd: 0.006, avgMs: 1500 },
      ],
    );
    expect(m.cacheShare).toBe(0.8);
    expect(m.thinkingShare).toBe(0.75);
    expect(m.costByTier).toEqual({ haiku: 0.004, sonnet: 0.006 });
  });
});

// ─── переписывание и кэш ────────────────────────────────────────────────────

const answer = (p: Record<string, unknown> = {}) => JSON.stringify({ summary: "", language: "ru", stage: "discovery", action: "reply", reply: "Подскажу 🙂 Для кого книга?", handoff_reason: "none", fields: {}, event_date: "", plan: "unknown", asked_to_order: false, agreed: false, agreed_quote: "", ...p });
const BAD = answer({ reply: "Для вас сделаю за 12 345 ₸!" });
function routed(script: string[], policy: Partial<RoutePolicyView> = {}) {
  const tiers: (string | undefined)[] = [];
  const m: BotSellerModel = {
    configured: async () => true,
    policy: async () => ({ mode: "on", defaultTier: "haiku", sonnetAt: 2, opusAt: 6, maxExtra: 2, budgetUsd: null, dailyBudgetUsd: null, rewrite: "same", ...policy }),
    complete: async (r) => {
      if (r.user.includes("черновик следующего сообщения менеджера")) return { text: answer(), usage: { input: 1, output: 1 } };
      tiers.push(r.tier);
      return { text: script.shift() ?? answer(), usage: { input: 1, output: 1 } };
    },
  };
  return { m, tiers };
}
const sellConfig = (): BotConfig => ({ ...BOT_CONFIG, sell: { ...defaultBotConfig.sell, on: true, engine: "ai", hidePrices: false, speaksAs: "assistant" } });
async function oneTurn(m: BotSellerModel, text = "Сколько стоит?") {
  const t = setup({ bot: "always", config: sellConfig(), seller: m });
  await t.service.ingest(inbound({ text, at: t.deps.clock.now() }));
  await t.advance(BOT_PAUSE_MS + 1);
  return t;
}

describe("ответ не прошёл проверку — сначала переписывает тот же уровень (кэш тёплый), потом выше", () => {
  it("Haiku исправился сам — Sonnet не вызывается", async () => {
    const { m, tiers } = routed([BAD, answer()]);
    const t = await oneTurn(m);
    expect(tiers).toEqual(["haiku", "haiku"]);
    expect(t.sent.filter((x) => !/помощница/.test(x))).toEqual(["Подскажу 🙂 Для кого книга?"]);
  });

  it("Haiku не исправился — переписывает Sonnet; клиенту уходит только исправленный ответ", async () => {
    const { m, tiers } = routed([BAD, BAD, answer({ reply: "Расскажу о книге 🙂 Для кого она?" })]);
    const t = await oneTurn(m);
    expect(tiers).toEqual(["haiku", "haiku", "sonnet"]);
    expect(t.sent.some((x) => x.includes("12 345"))).toBe(false);
    expect(t.sent.at(-1)).toBe("Расскажу о книге 🙂 Для кого она?");
    const route = readBotTrace(t.events.filter((e) => e.kind === "turn").at(-1)?.meta)?.route;
    expect(route?.escalations).toEqual([{ from: "haiku", to: "sonnet", cause: "rejected" }]);
  });

  it("подняться некуда (лимит эскалаций) — лишнего запроса нет, дважды не прошло — менеджеру", async () => {
    const { m, tiers } = routed([BAD, BAD], { maxExtra: 0 });
    const t = await oneTurn(m);
    expect(tiers).toEqual(["haiku", "haiku"]);
    expect(t.conv().botState).toMatchObject({ phase: "done", outcome: "handoff" });
  });

  it("режим «сразу выше» — как раньше: переписывает Sonnet", async () => {
    const { m, tiers } = routed([BAD, answer()], { rewrite: "up" });
    await oneTurn(m);
    expect(tiers).toEqual(["haiku", "sonnet"]);
  });

  it("ответ не по схеме — сначала повтор тем же уровнем, не вышло — уровнем выше", async () => {
    const { m, tiers } = routed(["не JSON", "не JSON", answer()]);
    await oneTurn(m, "Здравствуйте, хочу книгу маме");
    expect(tiers).toEqual(["haiku", "haiku", "sonnet"]);
  });
});

describe("срок кэша по уровням", () => {
  it("политика: час по умолчанию, 5 минут — по настройке; уходит модели и в стоимость записи", async () => {
    expect(readRoutePolicy({}).cacheTtl).toEqual({ haiku: "1h", sonnet: "1h", opus: "1h" });
    const policy = readRoutePolicy({ "seller.route.cacheTtl.sonnet": "5m" });
    const asked: (string | undefined)[] = [];
    const lm = (model: string): LanguageModel => ({ configured: async () => true, describe: async () => ({ provider: "anthropic", label: "Claude", model }), ask: async (r) => (asked.push(r.cacheTtl), { text: "{}", usage: { input: 0, output: 0, cacheWrite: 1_000_000, model } }) });
    const m = sellerModel({ policy: async () => policy, claude: lm, fallbacks: async () => [], legacy: lm("x") }, async () => ({ provider: "anthropic", apiKey: "", model: "", baseUrl: "" }), async () => null);
    const a = await m.complete({ system: "s", user: "u", schema: {}, timeoutMs: 5000 });
    const b = await m.complete({ system: "s", user: "u", schema: {}, timeoutMs: 5000, tier: "sonnet" });
    expect(asked).toEqual(["1h", "5m"]);
    // Запись 1M токенов: Haiku на час — $0.20, Sonnet на 5 минут — $2.50 (1.25× входа), а не $4.
    expect(a.served.costUsd).toBeCloseTo(0.2, 8);
    expect(b.served.costUsd).toBeCloseTo(2.5, 8);
    expect(costUsd({ input: 0, output: 0, cacheWrite: 1_000_000 }, "claude-sonnet-5-5", DEFAULT_PRICES)).toBeCloseTo(4, 8);
  });

  it("прогон по моментам запросов: редкие вызовы — дешевле 5 минут, частые с паузами до часа — дешевле час", () => {
    const min = 60_000;
    const rare = Array.from({ length: 30 }, (_, i) => i * 3 * 60 * min);
    expect(cacheTtlAdvice(rare, "sonnet")).toMatchObject({ calls: 30, cost5m: 37.5, cost1h: 60, ratio: 0.63 });
    const everyTwenty = Array.from({ length: 30 }, (_, i) => i * 20 * min);
    expect(cacheTtlAdvice(everyTwenty, "sonnet").ratio).toBeGreaterThan(1.15);
    const burst = Array.from({ length: 30 }, (_, i) => i * min);
    expect(cacheTtlAdvice(burst, "haiku").ratio).toBeLessThan(1);
  });
});
