import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@/shared/infrastructure/db";
import { salesAnalytics } from "@/modules/reporting/infrastructure/SalesAnalytics";

/**
 * Первый ответ в аналитике (analytics-2, chats-d1) на PostgreSQL: ответ человека отдельно от бота и правил, заметка —
 * не ответ и не ожидание; «Сообщений» сотрудника — без заметок.
 * Запуск: INTEGRATION=1 npx vitest run tests/sales-analytics.integration.test.ts (база из DATABASE_URL с миграциями).
 */
const run = process.env.INTEGRATION === "1" ? describe : describe.skip;
const tag = `san${Date.now()}`;

run("reporting: скорость ответа (PostgreSQL)", () => {
  const q = async <T extends Record<string, unknown>>(query: ReturnType<typeof sql>) => (await db.execute<T>(query)).rows;
  const one = async (query: ReturnType<typeof sql>) => (await q<{ id: string }>(query))[0].id;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    ids.m = await one(sql`insert into users (email, password_hash, name, role) values (${`${tag}@test.kz`}, 'x', 'М', 'admin') returning id`);
    ids.c = await one(sql`insert into crm_conversations (channel, channel_id, chat_id) values ('whatsapp', ${tag}, ${tag}) returning id`);
    const msg = (dir: "in" | "out", ago: string, o: { author?: string; source?: string; internal?: boolean } = {}) =>
      q(sql`insert into crm_messages (conversation_id, direction, text, author_id, source, internal, created_at) values (${ids.c}, ${dir}, 'x', ${o.author ?? null}, ${o.source ?? null}, ${o.internal ?? false}, now() - ${ago}::interval)`);
    await msg("in", "60 minutes");
    await msg("out", "59 minutes", { source: "bot" });
    await msg("out", "55 minutes", { author: ids.m, internal: true });
    await msg("out", "50 minutes", { author: ids.m });
    // Второй разговор: ответили с телефона, пока он был у сотрудника.
    ids.c2 = await one(sql`insert into crm_conversations (channel, channel_id, chat_id) values ('whatsapp', ${tag}, ${tag + "2"}) returning id`);
    await q(sql`insert into crm_messages (conversation_id, direction, text, created_at) values (${ids.c2}, 'in', 'x', now() - interval '30 minutes')`);
    await q(sql`insert into crm_messages (conversation_id, direction, text, attributed_to, created_at) values (${ids.c2}, 'out', 'x', ${ids.m}, now() - interval '25 minutes')`);
  });

  afterAll(async () => {
    await q(sql`delete from crm_conversations where channel_id = ${tag}`);
    await q(sql`delete from users where email = ${tag + "@test.kz"}`);
    await pool.end();
  });

  it("человек ответил через 10 минут, бот — через минуту; заметка — не ответ и не в «Сообщениях»", async () => {
    const pipeline = (await q<{ id: string }>(sql`select id from crm_pipelines limit 1`))[0].id;
    const a = await salesAnalytics(pipeline, 7);
    const row = a.responses.rows.find((r) => r.conversation_id === ids.c)!;
    expect(Math.round((new Date(row.human!).getTime() - new Date(row.asked).getTime()) / 60_000)).toBe(10);
    expect(row.author_id).toBe(ids.m);
    expect(Math.round((new Date(row.bot!).getTime() - new Date(row.asked).getTime()) / 60_000)).toBe(1);
    expect(a.managers.rows.find((r) => r.id === ids.m)?.messages).toBe(1);
    // Ответ с телефона — тому, у кого был телефон: и в скорости ответа, и в колонке «с телефона».
    expect(a.responses.rows.find((r) => r.conversation_id === ids.c2)?.author_id).toBe(ids.m);
    expect(a.managers.rows.find((r) => r.id === ids.m)?.phone_messages).toBe(1);
  });
});
