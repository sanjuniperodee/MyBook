import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@/shared/infrastructure/db";
import { morningDigest } from "@/modules/reporting/infrastructure/Digest";
import { iso, localDay } from "@/modules/reporting/infrastructure/time";

/**
 * Цифры утренней сводки (bots-11) на PostgreSQL — прирост от тестовых строк: ожидание дольше норматива, «я оплатил»,
 * даты событий на 3 дня, ночь бота.
 * Запуск: INTEGRATION=1 npx vitest run tests/morning-digest.integration.test.ts (база из DATABASE_URL с миграциями).
 */
const run = process.env.INTEGRATION === "1" ? describe : describe.skip;
const tag = `mdg${Date.now()}`;

run("reporting: утренняя сводка (PostgreSQL)", () => {
  const q = async <T extends Record<string, unknown>>(query: ReturnType<typeof sql>) => (await db.execute<T>(query)).rows;
  const one = async (query: ReturnType<typeof sql>) => (await q<{ id: string }>(query))[0].id;
  let base: Awaited<ReturnType<typeof morningDigest>>;

  beforeAll(async () => {
    base = await morningDigest(15);
    const open = await one(sql`select id from crm_stages where kind = 'open' order by position limit 1`);
    const deal = (fields: Record<string, string> = {}) => one(sql`insert into crm_deals (title, stage_id, custom_fields) values (${tag}, ${open}, ${JSON.stringify(fields)}::jsonb) returning id`);
    const conv = (awaiting: string) => one(sql`insert into crm_conversations (channel, channel_id, chat_id, awaiting_since) values ('whatsapp', ${tag}, ${`${tag}${awaiting}`}, now() - ${awaiting}::interval) returning id`);
    const long = await conv("40 minutes");
    await conv("5 minutes");
    await q(sql`insert into crm_bot_events (conversation_id, kind, created_at) values (${long}, 'started', now() - interval '6 hours'), (${long}, 'handoff', now() - interval '5 hours')`);
    const d = await deal({ event_date: iso(localDay(2)) });
    await deal({ event_date: iso(localDay(10)) });
    await q(sql`insert into deal_invoices (token, deal_id, plan, agreed_total, amount, purpose, expires_at, claimed_at) values (${tag}, ${d}, 'hardcover', 30000, 15000, 'prepayment', now() + interval '5 days', now())`);
  });

  afterAll(async () => {
    await q(sql`delete from crm_conversations where channel_id = ${tag}`);
    await q(sql`delete from deal_invoices where token = ${tag}`);
    await q(sql`delete from crm_deals where title = ${tag}`);
    await pool.end();
  });

  it("каждая цифра растёт ровно на свои строки", async () => {
    const now = await morningDigest(15);
    expect({ waiting: now.waiting - base.waiting, claims: now.claims - base.claims, deadlines: now.deadlines - base.deadlines, botChats: now.botChats - base.botChats, botHandoffs: now.botHandoffs - base.botHandoffs }).toEqual({
      waiting: 1,
      claims: 1,
      deadlines: 1,
      botChats: 1,
      botHandoffs: 1,
    });
  });
});
