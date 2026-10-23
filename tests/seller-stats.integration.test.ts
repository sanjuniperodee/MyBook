import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@/shared/infrastructure/db";
import { botMetrics } from "@/modules/messaging/infrastructure/persistence";

/**
 * Статистика продажника (bots-2, bots-6, analytics-26) на PostgreSQL: беседы по дням, ответ клиента за сутки по типу
 * сообщения (ответ, подборка, 1-е и 2-е напоминание), вопросы без ответа. Цифры — прирост от тестовых строк.
 * Запуск: INTEGRATION=1 npx vitest run tests/seller-stats.integration.test.ts (база из DATABASE_URL с миграциями).
 */
const run = process.env.INTEGRATION === "1" ? describe : describe.skip;
const tag = `sst${Date.now()}`;

run("messaging: статистика продажника (PostgreSQL)", () => {
  const q = async <T extends Record<string, unknown>>(query: ReturnType<typeof sql>) => (await db.execute<T>(query)).rows;
  const one = async (query: ReturnType<typeof sql>) => (await q<{ id: string }>(query))[0].id;
  let base: Awaited<ReturnType<typeof botMetrics>>;
  let conv = "";

  beforeAll(async () => {
    base = await botMetrics(30);
    conv = await one(sql`insert into crm_conversations (channel, channel_id, chat_id) values ('whatsapp', ${tag}, ${tag}) returning id`);
    const msg = async (dir: "in" | "out", ago: string, text = "x") =>
      one(sql`insert into crm_messages (conversation_id, direction, text, source, created_at) values (${conv}, ${dir}, ${text}, ${dir === "out" ? "bot" : null}, now() - ${ago}::interval) returning id`);
    const turn = async (ago: string, meta: Record<string, unknown>) => {
      const m = await msg("out", ago);
      await q(sql`insert into crm_bot_events (conversation_id, kind, meta, message_id, created_at) values (${conv}, 'turn', ${JSON.stringify({ v: 1, notes: [], result: {}, ...meta })}::jsonb, ${m}, now() - ${ago}::interval)`);
    };
    await q(sql`insert into crm_bot_events (conversation_id, kind, created_at) values (${conv}, 'started', now() - interval '5 days')`);
    await msg("in", "5 days");
    await turn("4 days 23 hours", { purpose: "reply", materials: { files: 2 } }); // подборка — клиент ответил
    await msg("in", "4 days 20 hours", "А сколько стоит доставка в Шымкент?");
    await q(sql`insert into crm_bot_events (conversation_id, kind, reason, created_at) values (${conv}, 'handoff', 'unanswered', now() - interval '4 days 20 hours')`);
    await turn("4 days", { purpose: "follow_up" }); // 1-е напоминание — молчит
    await turn("3 days", { purpose: "follow_up" }); // 2-е — ответил
    await msg("in", "2 days 20 hours");
    await turn("2 hours", { purpose: "follow_up" }); // свежее — ещё не в счёт
  });

  afterAll(async () => {
    await q(sql`delete from crm_conversations where channel_id = ${tag}`);
    await pool.end();
  });

  it("ответ за сутки по типу сообщения, беседы по дням и вопросы без ответа", async () => {
    const m = await botMetrics(30);
    const delta = (k: string) => ({ sent: (m.touches?.[k]?.sent ?? 0) - (base.touches?.[k]?.sent ?? 0), replied: (m.touches?.[k]?.replied ?? 0) - (base.touches?.[k]?.replied ?? 0) });
    expect(delta("materials")).toEqual({ sent: 1, replied: 1 });
    expect(delta("remind1")).toEqual({ sent: 1, replied: 0 });
    expect(delta("remind2")).toEqual({ sent: 1, replied: 1 });
    expect(delta("remind3")).toEqual({ sent: 0, replied: 0 });
    expect((m.daily ?? []).reduce((a, r) => a + r.started, 0) - (base.daily ?? []).reduce((a, r) => a + r.started, 0)).toBe(1);
    expect(m.gaps?.some((g) => g.conversationId === conv && g.text === "А сколько стоит доставка в Шымкент?")).toBe(true);
  });
});
