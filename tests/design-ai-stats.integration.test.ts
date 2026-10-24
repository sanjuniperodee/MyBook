import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/shared/infrastructure/db";
import { designAiStats } from "@/server/designAiStats";
import { completeDesignAi, designAiAllowance, reserveDesignAi } from "@/server/designAiStore";
import { saveSettings } from "@/modules/workspace";

/**
 * Статистика ИИ-дизайнера и управляемый бесплатный лимит на PostgreSQL. Цифры — прирост от тестовых строк.
 * Запуск: INTEGRATION=1 npx vitest run tests/design-ai-stats.integration.test.ts (база из DATABASE_URL с миграциями).
 */
const run = process.env.INTEGRATION === "1" ? describe : describe.skip;
const tag = `das${Date.now()}`;

run("ИИ-дизайнер: статистика и лимит (PostgreSQL)", () => {
  const q = async <T extends Record<string, unknown>>(query: ReturnType<typeof sql>) => (await db.execute<T>(query)).rows;
  let user = "";
  let book = "";
  let base: Awaited<ReturnType<typeof designAiStats>>;

  beforeAll(async () => {
    user = (await q<{ id: string }>(sql`insert into users (email, password_hash, name) values (${`${tag}@test.kz`}, 'x', ${`Тест ${tag}`}) returning id`))[0].id;
    book = (await q<{ id: string }>(sql`insert into books (user_id, theme, title) values (${user}, 'love', 'Тестовая книга') returning id`))[0].id;
    await saveSettings({ "designAi.freeLimit": "5" }, null);
    base = await designAiStats(30, 5);
    const add = (mode: string | null, status: string, source: string, usage: object, extra: { model?: string; cost?: number; ms?: number; polish?: string; ops?: unknown[]; errors?: string[] } = {}) =>
      q(sql`insert into design_ai_requests (user_id, book_id, target, prompt, status, source, mode, model, cost_usd, ms, polish, usage, ops, errors) values (${user}, ${book}, 'cover', 'просьба', ${status}, ${source}, ${mode}, ${extra.model ?? null}, ${extra.cost ?? null}, ${extra.ms ?? null}, ${extra.polish ?? null}, ${JSON.stringify(usage)}::jsonb, ${JSON.stringify(extra.ops ?? [])}::jsonb, ${JSON.stringify(extra.errors ?? [])}::jsonb)`);
    // Новая запись: всё записано. Старые: режим по форме операций, стоимость по Haiku.
    await add("create", "ok", "free", { inputTokens: 1000, outputTokens: 2000, cacheReadTokens: 0, cacheWriteTokens: 0 }, { model: "claude-opus-5-5", cost: 0.05, ms: 40_000, polish: "fixed" });
    await add(null, "ok", "free", { inputTokens: 1_000_000, outputTokens: 0 }, { ops: [{ name: "Вариант", ops: [] }] });
    await add(null, "ok", "credit", { inputTokens: 0, outputTokens: 1_000_000 }, { ops: [{ title: "Совет", ops: [] }], errors: ["не применилось"] });
    await add(null, "failed", "free", {});
    await q(sql`insert into design_ai_purchases (user_id, pack_id, requests, amount, status) values (${user}, 'x', 10, 990, 'paid'), (${user}, 'x', 30, 2490, 'pending_payment')`);
    await q(sql`insert into design_ai_credits (user_id, balance) values (${user}, 7)`);
  });

  afterAll(async () => {
    await q(sql`delete from users where id = ${user}`);
  });

  it("считает просьбы, режимы, стоимость и ошибки как прирост от тестовых строк", async () => {
    const s = await designAiStats(30, 5);
    expect(s.totals.ok - base.totals.ok).toBe(3);
    expect(s.totals.failed - base.totals.failed).toBe(1);
    expect(s.totals.free - base.totals.free).toBe(2);
    expect(s.totals.credit - base.totals.credit).toBe(1);
    expect(s.totals.withErrors - base.totals.withErrors).toBe(1);
    expect(s.totals.polished - base.totals.polished).toBe(1);
    expect(s.totals.polishFixed - base.totals.polishFixed).toBe(1);
    // 0,05 записанных + 1 М входа Haiku ($0,10) + 1 М выхода Haiku ($0,50).
    expect(s.totals.costUsd - base.totals.costUsd).toBeCloseTo(0.65, 4);
    expect(s.totals.estimated - base.totals.estimated).toBe(2);
    const mode = (st: typeof s, k: string) => st.byMode.find((m) => m.key === k)?.requests ?? 0;
    expect(mode(s, "create") - mode(base, "create")).toBe(1);
    expect(mode(s, "variants") - mode(base, "variants")).toBe(1);
    expect(mode(s, "review") - mode(base, "review")).toBe(1);
    const model = (st: typeof s, k: string) => st.byModel.find((m) => m.key === k)?.requests ?? 0;
    expect(model(s, "claude-opus-5-5") - model(base, "claude-opus-5-5")).toBe(1);
    expect(model(s, "claude-haiku-5-5") - model(base, "claude-haiku-5-5")).toBe(2);
  });

  it("люди, покупки и последние запросы", async () => {
    const s = await designAiStats(30, 5);
    expect(s.people.used - base.people.used).toBe(1);
    expect(s.people.withCredits - base.people.withCredits).toBe(1);
    expect(s.people.creditsLeft - base.people.creditsLeft).toBe(7);
    expect(s.purchases.paid - base.purchases.paid).toBe(1);
    expect(s.purchases.paidAmount - base.purchases.paidAmount).toBe(990);
    expect(s.purchases.pendingAmount - base.purchases.pendingAmount).toBe(2490);
    const mine = s.recent.filter((r) => r.userId === user);
    expect(mine).toHaveLength(4);
    expect(mine.find((r) => r.status === "failed")).toBeTruthy();
    expect(mine.find((r) => r.mode === "review")?.errors).toBe(1);
    const top = s.topUsers.find((u) => u.userId === user);
    expect(top).toMatchObject({ requests: 3, free: 2, credit: 1, credits: 7 });
    // За всё время — тоже считается.
    expect((await designAiStats(0, 5)).totals.ok).toBeGreaterThanOrEqual(3);
  });

  it("бесплатный лимит берётся из настройки: можно поднять, опустить и обнулить", async () => {
    const a = await designAiAllowance(user);
    expect(a).toMatchObject({ limit: 5, remaining: 3, credits: 7 });
    await saveSettings({ "designAi.freeLimit": "2" }, null);
    expect(await designAiAllowance(user)).toMatchObject({ limit: 2, remaining: 0 });
    // Бесплатные кончились — следующий запрос списывается из купленных.
    const r = await reserveDesignAi({ userId: user, bookId: book, target: "cover", prompt: "ещё", mode: "edit" });
    expect(r?.source).toBe("credit");
    await completeDesignAi(r!.id, { reply: "ок", ops: [], errors: [], usage: { inputTokens: 1 }, model: "claude-haiku-5-5", costUsd: 0.000001, ms: 900, polish: null });
    await saveSettings({ "designAi.freeLimit": "50" }, null);
    expect(await designAiAllowance(user)).toMatchObject({ limit: 50, remaining: 48 });
    // Мусор в настройке — по умолчанию 5; 0 — только купленные.
    await saveSettings({ "designAi.freeLimit": "много" }, null);
    expect((await designAiAllowance(user)).limit).toBe(5);
    await saveSettings({ "designAi.freeLimit": "0" }, null);
    expect(await designAiAllowance(user)).toMatchObject({ limit: 0, remaining: 0 });
    await saveSettings({ "designAi.freeLimit": "5" }, null);
  });
});
