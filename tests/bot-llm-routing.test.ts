import { describe, expect, it } from "vitest";
import { chooseSellerTier, defaultBotConfig, escalateTier, llmMetrics, newSellerAiState, readBotTrace, type BotConfig, type RouteInput, type RouteTier, type TraceRoute } from "@/modules/messaging/domain";
import { BOT_PAUSE_MS, type BotSellerModel, type RoutePolicyView, type RouteServed } from "@/modules/messaging/application";
import { traceRows } from "@/modules/messaging/ui/botTrace";
import { BOT_CONFIG, inbound, setup } from "./doubles/botHarness";

// ─── выбор уровня: правила без запроса к модели ─────────────────────────────

const POLICY = { defaultTier: "haiku" as const, sonnetAt: 2, opusAt: 6 };
const route = (clientText: string, p: Partial<RouteInput> = {}) =>
  chooseSellerTier({ purpose: "reply", clientText, history: [{ from: "client", text: clientText }], ai: { ...newSellerAiState() }, deadline: null, policy: POLICY, ...p });

describe("маршрут модели: выбор уровня по признакам сложности", () => {
  it.each([
    ["приветствие", "Здравствуйте!"],
    ["FAQ: цена", "Сколько стоит печатная книга?"],
    ["FAQ: сроки", "Сколько дней делается книга?"],
    ["сбор контактов", "Меня зовут Айгерим, мой номер 87011234567"],
    ["квалификация", "Хочу книгу маме на юбилей"],
    ["казахский: FAQ", "Сәлеметсіз бе! Кітап қанша тұрады?"],
    ["казахский: квалификация", "Анама туған күнге кітап керек"],
  ])("обычный ход (%s) — Haiku, без эскалации", (_, text) => {
    const r = route(text);
    expect(r.tier).toBe("haiku");
    expect(r.reasons).toEqual([]);
  });

  it("длинное недовольное сообщение без признаков сложности — всё равно Haiku (решает не длина)", () => {
    const text = `Здравствуйте, ${"очень долго ждала ответа и немного расстроена, ".repeat(12)}подскажите, пожалуйста, как заказать книгу`;
    expect(route(text).tier).toBe("haiku");
  });

  it.each([
    ["возражение по цене", "Ой, дорого как-то", "price_objection"],
    ["казахский: дорого", "Қымбат екен ғой", "price_objection"],
    ["торг", "А скидку сделаете?", "discount"],
    ["сравнение вариантов", "Чем отличается печатная от электронной?", "compare"],
    ["казахский: сравнение", "Электронды мен баспа кітаптың айырмашылығы қандай?", "compare"],
    ["нерешённый вопрос", "Вы не ответили на мой вопрос про доставку", "unresolved"],
  ])("%s — Sonnet", (_, text, reason) => {
    const r = route(text);
    expect(r.tier).toBe("sonnet");
    expect(r.reasons).toContain(reason);
  });

  it("клиент повторяет вопрос, на который бот уже отвечал — нерешённый вопрос, Sonnet", () => {
    const history = [
      { from: "client" as const, text: "Можно ли доставить книгу в Караганду до пятницы?" },
      { from: "bot" as const, text: "Книга делается 5–7 дней 😊" },
      { from: "client" as const, text: "Так можно доставить книгу в Караганду до пятницы?" },
    ];
    const r = route(history[2].text, { history });
    expect(r.reasons).toContain("unresolved");
    expect(r.tier).toBe("sonnet");
  });

  it("противоречия и много взаимосвязанных условий — Opus", () => {
    const text = "Нужна печатная премиум книга подешевле, но при этом к 25 октября, доставка в Шымкент, оплата в рассрочку Kaspi, две книги на казахском";
    const r = route(text, { deadline: "late" });
    expect(r.hard).toBe(true);
    expect(r.reasons).toEqual(expect.arrayContaining(["contradiction", "constraints"]));
    expect(r.tier).toBe("opus");
  });

  it("много очков без «тяжёлого» признака (обычные возражения и торг) — не Opus", () => {
    const r = route("Дорого, скидку дадите? А в чём разница с электронной?", { ai: { ...newSellerAiState(), objections: 2, stage: "closing" } });
    expect(r.score).toBeGreaterThanOrEqual(6);
    expect(r.hard).toBe(false);
    expect(r.tier).toBe("sonnet");
  });

  it("напоминание молчащему и triage подсказки — уровень по умолчанию; потолок расходов — Haiku без эскалаций", () => {
    expect(route("Дорого", { purpose: "follow_up" }).tier).toBe("haiku");
    expect(route("Дорого", { purpose: "copilot", quick: true }).tier).toBe("haiku");
    const capped = route("Дешевле, но премиум к завтра", { overBudget: true });
    expect(capped).toMatchObject({ tier: "haiku", capped: true, reasons: ["budget"] });
    expect(escalateTier("haiku", capped, "rejected", POLICY)).toBeNull();
  });

  it("Sonnet или Opus выключены ради экономии — ход на ближайший включённый уровень ниже, эскалация их пропускает", () => {
    const hardText = "Нужна печатная премиум книга подешевле, но при этом к 25 октября, доставка в Шымкент, оплата в рассрочку Kaspi, две книги на казахском";
    expect(route(hardText, { deadline: "late", policy: { ...POLICY, tiers: { sonnet: true, opus: false } } }).tier).toBe("sonnet");
    expect(route(hardText, { deadline: "late", policy: { ...POLICY, tiers: { sonnet: false, opus: false } } }).tier).toBe("haiku");
    expect(route("Дорого", { policy: { ...POLICY, tiers: { sonnet: false, opus: true } } }).tier).toBe("haiku");
    const plain = route("Дорого");
    const hard = route(hardText, { deadline: "late" });
    expect(escalateTier("haiku", plain, "invalid", { ...POLICY, tiers: { sonnet: false, opus: true } })).toBeNull();
    expect(escalateTier("haiku", hard, "rejected", { ...POLICY, tiers: { sonnet: false, opus: true } })).toBe("opus");
    expect(escalateTier("haiku", plain, "invalid", { ...POLICY, tiers: { sonnet: false, opus: false } })).toBeNull();
    expect(escalateTier("sonnet", hard, "rejected", { ...POLICY, tiers: { sonnet: true, opus: false } })).toBeNull();
  });

  it("уровень по умолчанию — нижняя граница", () => {
    expect(route("Здравствуйте", { policy: { ...POLICY, defaultTier: "sonnet" } }).tier).toBe("sonnet");
  });

  it("эскалация: Haiku → Sonnet всегда; Sonnet → Opus только для сложных ходов и не из-за сбоя API; выше Opus — некуда", () => {
    const plain = route("Дорого");
    const hard = route("Подешевле, но премиум, к 25 октября, доставка в Шымкент", { deadline: "late" });
    expect(escalateTier("haiku", plain, "invalid", POLICY)).toBe("sonnet");
    expect(escalateTier("sonnet", plain, "rejected", POLICY)).toBeNull();
    expect(escalateTier("sonnet", hard, "rejected", POLICY)).toBe("opus");
    expect(escalateTier("sonnet", hard, "error", POLICY)).toBeNull();
    expect(escalateTier("opus", hard, "rejected", POLICY)).toBeNull();
  });
});

// ─── бот в чате с маршрутизацией ────────────────────────────────────────────

const ans = (p: Record<string, unknown> = {}) => ({
  summary: "",
  language: "ru",
  stage: "discovery",
  action: "reply",
  reply: "Здравствуйте! Для кого будет книга?",
  handoff_reason: "none",
  fields: { recipient: "", occasion: "" },
  event_date: "",
  plan: "unknown",
  asked_to_order: false,
  agreed: false,
  agreed_quote: "",
  ...p,
});

type Req = Parameters<BotSellerModel["complete"]>[0];
/** Цены как у Haiku / Sonnet / Opus 5.5 — по ним двойник считает стоимость ответа. */
const PRICE: Record<RouteTier, number> = { haiku: 0.1, sonnet: 2, opus: 4 };
const MODEL: Record<RouteTier, string> = { haiku: "claude-haiku-5-5", sonnet: "claude-sonnet-5-5", opus: "claude-opus-5-5" };

/** Модель-двойник с маршрутизацией: отвечает по сценарию, запоминает запросы и уровень каждого, считает стоимость. */
function routedModel(script: (Record<string, unknown> | string | Error)[], policy: Partial<RoutePolicyView> = {}) {
  const calls: Req[] = [];
  const p: RoutePolicyView = { mode: "on", defaultTier: "haiku", sonnetAt: 2, opusAt: 6, maxExtra: 2, budgetUsd: null, dailyBudgetUsd: null, ...policy };
  const model: BotSellerModel = {
    configured: async () => true,
    policy: async () => p,
    complete: async (req) => {
      calls.push(req);
      const next = script.shift();
      if (next === undefined) throw new Error("модель: сценарий кончился");
      if (next instanceof Error) throw next;
      // Режим shadow и off — отвечает модель по умолчанию, как у настоящего маршрутизатора.
      const tier = p.mode === "on" ? (req.tier ?? p.defaultTier) : p.defaultTier;
      const usage = { input: 1000, output: 100, cacheRead: 3000, cacheWrite: 0 };
      const cost = (usage.input * PRICE[tier] + usage.output * PRICE[tier] * 5 + usage.cacheRead * PRICE[tier] * 0.1) / 1e6;
      const served: RouteServed = { mode: p.mode, provider: "anthropic", model: MODEL[tier], tier: p.mode === "off" ? null : tier, wanted: req.tier ?? null, fallback: false, usage, costUsd: cost, ms: 800, attempts: [] };
      return { text: typeof next === "string" ? next : JSON.stringify(next), usage: { input: usage.input, output: usage.output }, served };
    },
  };
  return { model, calls };
}

const aiConfig = (p: Partial<BotConfig["sell"]> = {}): BotConfig => ({
  ...BOT_CONFIG,
  waitMinutes: 3,
  sell: { ...defaultBotConfig.sell, on: true, engine: "ai", takeover: true, prepay: 10000, invoice: true, hidePrices: false, speaksAs: "assistant", ...p },
});
const run = async (t: ReturnType<typeof setup>, ms = BOT_PAUSE_MS + 1) => t.advance(ms);
const routeOf = (t: ReturnType<typeof setup>) => readBotTrace(t.events.filter((e) => e.kind === "turn").at(-1)?.meta)?.route as TraceRoute;
const INTRO = /помощница менеджера|Марат менеджердің/;
/** Начало беседы (обычный ход на Haiku): одиночное «Дорого» бот считает продолжением чужой переписки и не начинает. */
const OPEN = ans({ fields: { recipient: "Маме", occasion: "" }, stage: "offer", reply: "Тёплый подарок маме 🤍 Какие остались вопросы?" });
async function opened(t: ReturnType<typeof setup>, calls: Req[]) {
  await t.service.ingest(inbound({ text: "Здравствуйте, хочу книгу маме" }));
  await run(t);
  calls.length = 0;
  t.sent.length = 0;
}
const said = (t: { sent: string[] }) => t.sent.filter((s) => !INTRO.test(s));

describe("AI-продажник с маршрутизацией Claude", () => {
  it("обычный FAQ — Haiku, один запрос, одно сообщение клиенту; в следе — уровень, токены с кэшем и стоимость", async () => {
    const { model, calls } = routedModel([ans({ reply: "Книга делается 5–7 дней 😊 Для кого она будет?" })]);
    const t = setup({ bot: "always", config: aiConfig(), seller: model });
    await t.service.ingest(inbound({ text: "Сколько дней делается книга?" }));
    await run(t);
    expect(calls.map((c) => c.tier)).toEqual(["haiku"]);
    expect(said(t)).toEqual(["Книга делается 5–7 дней 😊 Для кого она будет?"]);
    const r = routeOf(t);
    expect(r).toMatchObject({ mode: "on", chosen: "haiku", final: "haiku", escalations: [], capped: false });
    expect(r.calls).toEqual([expect.objectContaining({ why: "first", tier: "haiku", model: "claude-haiku-5-5", input: 1000, output: 100, cacheRead: 3000, retries: 0 })]);
    // 1000 × 0.1 + 100 × 0.5 + 3000 × 0.01 = 180 → $0.00018
    expect(r.costUsd).toBeCloseTo(0.00018, 8);
    expect(t.conv().botState?.ai).toMatchObject({ lastTier: "haiku", llmCostUsd: expect.closeTo(0.00018, 8) });
    // В следе нет текстов клиента и ответа.
    expect(JSON.stringify(r)).not.toMatch(/делается|Для кого/);
    expect(traceRows(readBotTrace(t.events.filter((e) => e.kind === "turn").at(-1)?.meta)!).find((x) => x.label === "Маршрут модели")?.lines[0]).toMatch(/выбран Haiku · обычный ход/);
  });

  it("возражение по цене — сразу Sonnet", async () => {
    const { model, calls } = routedModel([OPEN, ans({ stage: "objection", reply: "Понимаю вас 🙂 Можно начать с предоплаты — какой вариант вам удобнее?" })]);
    const t = setup({ bot: "always", config: aiConfig(), seller: model });
    await opened(t, calls);
    await t.service.ingest(inbound({ text: "Хм, дорого как-то для меня" }));
    await run(t);
    expect(calls.map((c) => c.tier)).toEqual(["sonnet"]);
    expect(routeOf(t)).toMatchObject({ chosen: "sonnet", reasons: expect.arrayContaining(["price_objection"]) });
  });

  it("казахский: возражение — Sonnet, ответ на казахском уходит одним сообщением", async () => {
    const { model, calls } = routedModel([OPEN, ans({ language: "kk", stage: "objection", reply: "Түсінемін 🙂 Алдын ала төлеммен бастауға болады. Қай нұсқа ыңғайлы?" })]);
    const t = setup({ bot: "always", config: aiConfig(), seller: model });
    await opened(t, calls);
    await t.service.ingest(inbound({ text: "Қымбат екен" }));
    await run(t);
    expect(calls[0].tier).toBe("sonnet");
    expect(said(t)).toEqual(["Түсінемін 🙂 Алдын ала төлеммен бастауға болады. Қай нұсқа ыңғайлы?"]);
  });

  it("ответ Haiku не по схеме — повтор на Sonnet с той же инструкцией и перепиской (контекст не теряется), клиенту одно сообщение", async () => {
    const { model, calls } = routedModel(["это не JSON", ans({ fields: { recipient: "Маме", occasion: "" }, reply: "Тёплый подарок маме 🤍 К какой дате нужна книга?" })]);
    const t = setup({ bot: "always", config: aiConfig(), seller: model });
    await t.service.ingest(inbound({ text: "Хочу книгу маме" }));
    await run(t);
    expect(calls.map((c) => c.tier)).toEqual(["haiku", "sonnet"]);
    expect(calls[1].system).toBe(calls[0].system);
    expect(calls[1].user).toBe(calls[0].user);
    expect(calls[1].cachePrefix).toBe(calls[0].cachePrefix);
    expect(said(t)).toEqual(["Тёплый подарок маме 🤍 К какой дате нужна книга?"]);
    // Поле сделки записано один раз — по итоговому решению.
    expect(t.deals[0].fields).toEqual({ recipient: "Маме" });
    expect(routeOf(t)).toMatchObject({ final: "sonnet", escalations: [{ from: "haiku", to: "sonnet", cause: "invalid" }] });
  });

  it("ответ не прошёл проверку кода (чужая цена) — переписывает Sonnet; ушёл только исправленный текст", async () => {
    const { model, calls } = routedModel([ans({ reply: "Для вас сделаю за 12 345 ₸!" }), ans({ reply: "Подскажу 🙂 Для кого книга?" })]);
    const t = setup({ bot: "always", config: aiConfig(), seller: model });
    await t.service.ingest(inbound({ text: "Сколько стоит?" }));
    await run(t);
    expect(calls.map((c) => c.tier)).toEqual(["haiku", "sonnet"]);
    expect(calls[1].system).toContain("не прошёл проверку");
    expect(said(t)).toEqual(["Подскажу 🙂 Для кого книга?"]);
    expect(t.sent.some((s) => s.includes("12 345"))).toBe(false);
  });

  it("сложное исключение: Sonnet не справился — переписывает Opus", async () => {
    const { model, calls } = routedModel([OPEN, ans({ stage: "objection", reply: "Сделаю скидку 50%!" }), ans({ stage: "objection", reply: "Понимаю 🙂 Давайте подберу: что для вас главнее — цена или оформление?" })]);
    const t = setup({ bot: "always", config: aiConfig(), seller: model });
    await opened(t, calls);
    // Противоречие («подешевле, но премиум») — тяжёлый признак, но очков ниже порога Opus: первый ответ — Sonnet, после неудачи — Opus.
    await t.service.ingest(inbound({ text: "Хочу подешевле, но премиум" }));
    await run(t);
    expect(calls.map((c) => c.tier)).toEqual(["sonnet", "opus"]);
    expect(routeOf(t)).toMatchObject({ chosen: "sonnet", final: "opus", escalations: [{ from: "sonnet", to: "opus", cause: "rejected" }] });
    expect(said(t)).toHaveLength(1);
  });

  it("обычное возражение: Sonnet не прошёл проверку — второй раз Sonnet, а не Opus", async () => {
    const { model, calls } = routedModel([OPEN, ans({ stage: "objection", reply: "Сделаю скидку 50%!" }), ans({ stage: "objection", reply: "Понимаю вас 🙂 Какой вариант вам удобнее?" })]);
    const t = setup({ bot: "always", config: aiConfig(), seller: model });
    await opened(t, calls);
    await t.service.ingest(inbound({ text: "Дорого" }));
    await run(t);
    expect(calls.map((c) => c.tier)).toEqual(["sonnet", "sonnet"]);
  });

  it("модель не уверена («не знаю — менеджеру») — тот же ход на Sonnet, менеджер не нужен", async () => {
    const { model, calls } = routedModel([ans({ action: "handoff", handoff_reason: "unsure", reply: "Уточню у менеджера 🙏" }), ans({ reply: "Да, можно на казахском языке 😊 Для кого будет книга?" })]);
    const t = setup({ bot: "always", config: aiConfig(), seller: model });
    await t.service.ingest(inbound({ text: "А книгу можно на казахском?" }));
    await run(t);
    expect(calls.map((c) => c.tier)).toEqual(["haiku", "sonnet"]);
    expect(said(t)).toEqual(["Да, можно на казахском языке 😊 Для кого будет книга?"]);
    expect(t.conv().botState).toMatchObject({ phase: "active" });
    expect(routeOf(t).escalations).toEqual([{ from: "haiku", to: "sonnet", cause: "unsure" }]);
  });

  it("Sonnet выключен: возражение и неудачный ответ остаются на Haiku — экономия токенов", async () => {
    const { model, calls } = routedModel([OPEN, ans({ stage: "objection", reply: "Скидка 50%!" }), ans({ stage: "objection", reply: "Понимаю вас 🙂 Какой вариант удобнее?" })], { tiers: { sonnet: false, opus: false } });
    const t = setup({ bot: "always", config: aiConfig(), seller: model });
    await opened(t, calls);
    await t.service.ingest(inbound({ text: "Дорого" }));
    await run(t);
    expect(calls.map((c) => c.tier)).toEqual(["haiku", "haiku"]);
    expect(routeOf(t).escalations).toEqual([]);
  });

  it("лимит эскалаций за ход: maxExtra = 0 — без повышения уровня; запросов не больше прежнего", async () => {
    const { model, calls } = routedModel(["не JSON", ans({ reply: "Для вас сделаю за 12 345 ₸!" }), ans({ reply: "Подскажу 🙂 Для кого книга?" })], { maxExtra: 0 });
    const t = setup({ bot: "always", config: aiConfig(), seller: model });
    await t.service.ingest(inbound({ text: "Сколько стоит?" }));
    await run(t);
    expect(calls.map((c) => c.tier)).toEqual(["haiku", "haiku", "haiku"]);
    expect(routeOf(t).escalations).toEqual([]);
    expect(said(t)).toEqual(["Подскажу 🙂 Для кого книга?"]);
  });

  it("лимит эскалаций за ход: maxExtra = 1 — одна эскалация, дальше тот же уровень", async () => {
    const { model, calls } = routedModel(["не JSON", ans({ reply: "Для вас сделаю за 12 345 ₸!" }), ans({ reply: "Подскажу 🙂 Для кого книга?" })], { maxExtra: 1 });
    const t = setup({ bot: "always", config: aiConfig(), seller: model });
    await t.service.ingest(inbound({ text: "Сколько стоит?" }));
    await run(t);
    expect(calls.map((c) => c.tier)).toEqual(["haiku", "sonnet", "sonnet"]);
    expect(routeOf(t).escalations).toHaveLength(1);
  });

  it("rate limit и таймаут: повтор хода на уровне выше; второй сбой — повтор через минуту, клиенту одно сообщение", async () => {
    const rateLimit = Object.assign(new Error("Слишком много запросов к Claude"), { kind: "rate_limit", attempts: [{ provider: "anthropic", model: "claude-haiku-5-5", tier: "haiku", kind: "rate_limit", ms: 120 }] });
    const timeout = Object.assign(new Error("Claude не ответил вовремя"), { kind: "timeout", attempts: [{ provider: "anthropic", model: "claude-sonnet-5-5", tier: "sonnet", kind: "timeout", ms: 30000 }] });
    const { model, calls } = routedModel([rateLimit, timeout, ans({ reply: "Для кого будет книга?" })]);
    const t = setup({ bot: "always", config: aiConfig(), seller: model });
    await t.service.ingest(inbound({ text: "Здравствуйте" }));
    await run(t);
    expect(calls.map((c) => c.tier)).toEqual(["haiku", "sonnet"]);
    expect(said(t)).toEqual([]);
    // Неудачные запросы — в следе без сообщения: какие модели пробовали и почему не вышло.
    expect(routeOf(t).calls).toEqual([expect.objectContaining({ why: "first", failed: "rate_limit", retries: 1 }), expect.objectContaining({ why: "retry", failed: "timeout", retries: 1 })]);
    await run(t, 61_000);
    expect(said(t)).toEqual(["Для кого будет книга?"]);
    expect(t.sent.filter((s) => s === "Для кого будет книга?")).toHaveLength(1);
  });

  it("переписка не влезла в окно модели — повтор той же моделью с последними сообщениями", async () => {
    const tooLong = Object.assign(new Error("Переписка слишком длинная"), { kind: "context" });
    const { model, calls } = routedModel([tooLong, ans({ reply: "Здравствуйте! Для кого будет книга?" })]);
    const t = setup({ bot: "always", config: aiConfig(), seller: model });
    await t.service.ingest(inbound({ text: "Здравствуйте" }));
    await run(t);
    expect(calls.map((c) => c.tier)).toEqual(["haiku", "haiku"]);
    expect(routeOf(t).calls.map((c) => c.why)).toEqual(["first", "context"]);
    expect(said(t)).toHaveLength(1);
  });

  it("потолок расходов на беседу — после него только Haiku, без эскалаций", async () => {
    const { model, calls } = routedModel([OPEN, ans({ stage: "objection", reply: "Понимаю 🙂 Какой вариант удобнее?" })], { budgetUsd: 0.0001 });
    const t = setup({ bot: "always", config: aiConfig(), seller: model });
    // Первый ход (Haiku, $0.00018) уже больше потолка — даже возражение дальше идёт на Haiku.
    await opened(t, calls);
    expect(t.conv().botState?.ai.llmCostUsd).toBeGreaterThan(0.0001);
    await t.service.ingest(inbound({ text: "Дорого" }));
    await run(t);
    expect(calls.map((c) => c.tier)).toEqual(["haiku"]);
    expect(routeOf(t)).toMatchObject({ capped: true, reasons: ["budget"] });
  });

  it("суточный потолок расходов (по журналу) — только Haiku", async () => {
    const { model, calls } = routedModel([OPEN, ans({ stage: "objection", reply: "Понимаю 🙂 Какой вариант удобнее?" })], { dailyBudgetUsd: 1 });
    const t = setup({ bot: "always", config: aiConfig(), seller: model });
    Object.assign(t.deps.store, { llmSpentSince: async () => 1.5 });
    await opened(t, calls);
    await t.service.ingest(inbound({ text: "Дорого" }));
    await run(t);
    expect(calls.map((c) => c.tier)).toEqual(["haiku"]);
  });

  it("режим наблюдения: отвечает модель по умолчанию, выбранный уровень только записан; лишних запросов нет", async () => {
    const { model, calls } = routedModel([OPEN, ans({ action: "handoff", handoff_reason: "unsure", reply: "Уточню у менеджера 🙏" })], { mode: "shadow" });
    const t = setup({ bot: "always", config: aiConfig(), seller: model });
    await opened(t, calls);
    await t.service.ingest(inbound({ text: "Дорого" }));
    await run(t);
    expect(calls).toHaveLength(1);
    expect(routeOf(t)).toMatchObject({ mode: "shadow", chosen: "sonnet", final: "haiku", escalations: [] });
  });

  it("маршрутизация выключена (off): как раньше — без эскалаций, повтор и переписывание той же моделью", async () => {
    const { model, calls } = routedModel(["не JSON", ans({ reply: "Для вас сделаю за 12 345 ₸!" }), ans({ reply: "Подскажу 🙂 Для кого книга?" })], { mode: "off" });
    const t = setup({ bot: "always", config: aiConfig(), seller: model });
    await t.service.ingest(inbound({ text: "Сколько стоит?" }));
    await run(t);
    expect(calls).toHaveLength(3);
    expect(routeOf(t)).toMatchObject({ mode: "off", escalations: [], final: null });
    expect(said(t)).toEqual(["Подскажу 🙂 Для кого книга?"]);
  });

  it("эскалация не повторяет действий в CRM: счёт выставляется один раз, по итоговому решению", async () => {
    const issued: unknown[] = [];
    const invoices = { issue: async (i: { amount: number }) => (issued.push(i), { label: "№12", amount: i.amount, text: `Счёт №12 на ${i.amount} ₸: https://mybook.kz/pay/abc` }) };
    const warm = ans({ stage: "offer", reply: "Такая книга — подарок на всю жизнь 🤍 Какие остались вопросы?" });
    const offer = ans({ stage: "offer", reply: "Печатная — от 30 000 ₸. Оформляем?", asked_to_order: true });
    const agree = ans({ action: "issue_invoice", stage: "agreed", agreed: true, plan: "hardcover", agreed_quote: "да, давайте", reply: "Отлично! Выставляю счёт 🙌" });
    const { model, calls } = routedModel([warm, offer, "не JSON", agree]);
    const t = setup({ bot: "always", config: aiConfig(), seller: model, invoices });
    await t.service.ingest(inbound({ text: "Хочу печатную книгу мужу" }));
    await run(t);
    await t.service.ingest(inbound({ text: "Сколько стоит?" }));
    await run(t);
    await t.service.ingest(inbound({ text: "да, давайте" }));
    await run(t);
    // Ответ на согласие сначала пришёл не по схеме — ход переписал Sonnet; счёт выставлен один раз.
    expect(calls.slice(-2).map((c) => c.tier)).toEqual(["haiku", "sonnet"]);
    expect(routeOf(t).escalations).toEqual([{ from: "haiku", to: "sonnet", cause: "invalid" }]);
    expect(issued).toHaveLength(1);
    expect(t.sent.filter((s) => s.startsWith("Счёт №12"))).toHaveLength(1);
  });

  it("порт без политики (старое подключение) — поведение прежнее: без уровня в запросе и без маршрута в следе", async () => {
    const calls: Req[] = [];
    const model: BotSellerModel = { configured: async () => true, complete: async (req) => (calls.push(req), { text: JSON.stringify(ans()), usage: { input: 10, output: 5 } }) };
    const t = setup({ bot: "always", config: aiConfig(), seller: model });
    await t.service.ingest(inbound({ text: "Здравствуйте" }));
    await run(t);
    expect(calls[0].tier).toBeUndefined();
    expect(routeOf(t)).toBeUndefined();
  });
});

describe("метрики модели продажника", () => {
  it("доли уровней, эскалации, стоимость на 1 000 ходов, токены с кэшем", () => {
    const m = llmMetrics(
      [
        { chosen: "haiku", final: "haiku", mode: "on", turns: 90, escalations: 0, costUsd: 0.018 },
        { chosen: "sonnet", final: "sonnet", mode: "on", turns: 8, escalations: 1, costUsd: 0.04 },
        { chosen: "haiku", final: "sonnet", mode: "on", turns: 1, escalations: 1, costUsd: 0.006 },
        { chosen: "sonnet", final: "opus", mode: "on", turns: 1, escalations: 1, costUsd: 0.01 },
      ],
      [
        { tier: "haiku", provider: "anthropic", model: "claude-haiku-5-5", calls: 91, failed: 1, fallback: 0, retries: 2, input: 91000, output: 9100, cacheRead: 270000, cacheWrite: 4000, costUsd: 0.0186, avgMs: 900 },
        { tier: null, provider: "deepseek", model: "deepseek-chat", calls: 1, failed: 0, fallback: 1, retries: 1, input: 1000, output: 100, cacheRead: 0, cacheWrite: 0, costUsd: 0, avgMs: 2100 },
      ],
    );
    expect(m.turns).toBe(100);
    expect(m.answered).toEqual({ haiku: 90, sonnet: 9, opus: 1 });
    expect(m.chosen).toEqual({ haiku: 91, sonnet: 9 });
    expect(m.escalations).toBe(3);
    expect(m.costUsd).toBeCloseTo(0.074, 6);
    expect(m.costPer1000).toBeCloseTo(0.74, 6);
    expect(m).toMatchObject({ calls: 92, failed: 1, fallback: 1, retries: 3, tokens: { input: 92000, output: 9200, cacheRead: 270000, cacheWrite: 4000 } });
    expect(m.models[0]).toMatchObject({ model: "claude-haiku-5-5", calls: 91 });
    expect(llmMetrics([], []).costPer1000).toBeNull();
  });
});
