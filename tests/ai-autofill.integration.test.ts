import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@/shared/infrastructure/db";
import { aiParsedSince, autofillCandidates, markAiParsed } from "@/modules/messaging/infrastructure/persistence";

/**
 * Выборка для автозаполнения полей сделки (bots-4) на PostgreSQL: затихшая переписка менеджера по открытой сделке с
 * пустым полем, без активного бота, новее прошлого разбора.
 * Запуск: INTEGRATION=1 npx vitest run tests/ai-autofill.integration.test.ts (база из DATABASE_URL с миграциями).
 */
const run = process.env.INTEGRATION === "1" ? describe : describe.skip;
const tag = `aaf${Date.now()}`;

run("messaging: кандидаты автозаполнения (PostgreSQL)", () => {
  const q = async <T extends Record<string, unknown>>(query: ReturnType<typeof sql>) => (await db.execute<T>(query)).rows;
  const one = async (query: ReturnType<typeof sql>) => (await q<{ id: string }>(query))[0].id;
  const ids: Record<string, string> = {};
  const now = new Date();

  beforeAll(async () => {
    const open = await one(sql`select id from crm_stages where kind = 'open' order by position limit 1`);
    const won = await one(sql`select id from crm_stages where kind = 'won' order by position limit 1`);
    const conv = async (key: string, o: { stage?: string; fields?: Record<string, string>; ago?: string; manager?: boolean; bot?: string | null; parsed?: string | null }) => {
      const deal = await one(sql`insert into crm_deals (title, stage_id, custom_fields) values (${tag}, ${o.stage ?? open}, ${JSON.stringify(o.fields ?? {})}::jsonb) returning id`);
      ids[key] = await one(sql`
        insert into crm_conversations (channel, channel_id, chat_id, contact_name, deal_id, last_message_at, last_outgoing_at, bot_state, ai_parsed_at)
        values ('whatsapp', ${tag}, ${`${tag}${key}`}, 'К', ${deal}, now() - ${o.ago ?? "2 hours"}::interval,
          ${o.manager === false ? null : sql`now() - interval '3 hours'`}, ${o.bot ? sql`${o.bot}::jsonb` : null}, ${o.parsed ? sql`now() - ${o.parsed}::interval` : null})
        returning id`);
    };
    await conv("fresh", {});
    await conv("bot", { bot: '{"phase":"asking"}' });
    await conv("botDone", { bot: '{"phase":"done"}', ago: "3 hours" });
    await conv("noManager", { manager: false });
    await conv("tooSoon", { ago: "10 minutes" });
    await conv("tooOld", { ago: "8 days" });
    await conv("filled", { fields: { event_date: "2026-12-31", recipient: "Мама", occasion: "Новый год" } });
    await conv("won", { stage: won });
    await conv("parsedAfter", { parsed: "1 hour" });
    await conv("parsedBefore", { parsed: "5 hours" });
  });

  afterAll(async () => {
    await q(sql`delete from crm_conversations where channel_id = ${tag}`);
    await q(sql`delete from crm_deals where title = ${tag}`);
    await pool.end();
  });

  it("берёт затихшую переписку менеджера с пустым полем; бот, без ответа человека, слишком свежее и старое, заполненное, закрытое и уже разобранное — нет", async () => {
    const got = (await autofillCandidates(50, now)).map((c) => Object.entries(ids).find(([, id]) => id === c.conversationId)?.[0]).filter(Boolean);
    expect(got.sort()).toEqual(["botDone", "fresh", "parsedBefore"]);
  });

  it("отметка разбора убирает диалог из выборки и идёт в счёт дня", async () => {
    const before = await aiParsedSince(new Date(now.getTime() - 60_000));
    await markAiParsed(ids.fresh, new Date());
    expect((await autofillCandidates(50, now)).some((c) => c.conversationId === ids.fresh)).toBe(false);
    expect(await aiParsedSince(new Date(now.getTime() - 60_000))).toBe(before + 1);
  });
});
