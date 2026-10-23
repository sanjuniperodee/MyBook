import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@/shared/infrastructure/db";
import { DrizzleSubjectLoader } from "@/modules/automation/infrastructure/persistence";

/**
 * Куда правило пишет клиенту (PostgreSQL): «Отправить сообщение» — в диалог сделки, а если у сделки его нет (сделку
 * годовщины только что создало правило) — в последний диалог клиента; сообщение о заказе — только в WhatsApp (GOWA
 * или Wazzup).
 * Запуск: INTEGRATION=1 npx vitest run tests/automation-subjects.integration.test.ts (база из DATABASE_URL с миграциями).
 */
const run = process.env.INTEGRATION === "1" ? describe : describe.skip;
const tag = `as${Date.now()}`;

run("automation: переписка для сообщения правила (PostgreSQL)", () => {
  const ids: Record<string, string> = {};
  const q = async <T extends Record<string, unknown>>(query: ReturnType<typeof sql>) => (await db.execute<T>(query)).rows;
  const loader = new DrizzleSubjectLoader({ list: async () => [] } as never);

  beforeAll(async () => {
    const [u] = await q<{ id: string }>(sql`insert into users (email, password_hash, name) values (${`${tag}@t.kz`}, 'x', 'Клиент') returning id`);
    ids.client = u.id;
    const [stage] = await q<{ id: string }>(sql`select id from crm_stages where kind = 'open' order by position limit 1`);
    const deal = async (key: string) => {
      const [d] = await q<{ id: string }>(sql`insert into crm_deals (title, stage_id, contact_name, client_id) values (${tag}, ${stage.id}, 'К', ${ids.client}) returning id`);
      ids[key] = d.id;
    };
    await deal("withChat");
    await deal("fresh");
    const conv = async (key: string, channel: string, ago: string, dealKey: string | null) => {
      const [c] = await q<{ id: string }>(sql`
        insert into crm_conversations (channel, channel_id, chat_id, contact_name, client_id, deal_id, last_message_at)
        values (${channel}, ${tag}, ${`${tag}${key}`}, 'К', ${ids.client}, ${dealKey ? ids[dealKey] : null}, now() - ${ago}::interval) returning id`);
      ids[key] = c.id;
    };
    // Диалог сделки — давний; у клиента есть свежее письмо и чуть менее свежая переписка в WhatsApp API (Wazzup).
    await conv("dealChat", "whatsapp", "3 days", "withChat");
    await conv("mail", "email", "1 hour", null);
    await conv("wapi", "wapi", "2 hours", null);
  });
  afterAll(async () => {
    await q(sql`delete from crm_conversations where channel_id = ${tag}`);
    await q(sql`delete from crm_deals where title = ${tag}`);
    await q(sql`delete from users where email like ${tag + "%"}`);
    await pool.end();
  });

  it("у сделки есть диалог — он, даже если у клиента есть диалог свежее", async () => {
    expect(await loader.latestConversation(ids.withChat, ids.client)).toBe(ids.dealChat);
  });

  it("у сделки диалога нет (её только что создало правило) — последний диалог клиента; без сделки — тоже", async () => {
    expect(await loader.latestConversation(ids.fresh, ids.client)).toBe(ids.mail);
    expect(await loader.latestConversation(null, ids.client)).toBe(ids.mail);
    expect(await loader.latestConversation(null, null)).toBeNull();
  });

  it("язык клиента без казахской учётной записи — по языку переписки, который понял бот (automation-14)", async () => {
    expect((await loader.load({ subject: "x", dealId: ids.withChat })).locale).toBe("ru");
    await q(sql`update crm_conversations set bot_state = '{"phase":"done","lang":"kk"}'::jsonb where id = ${ids.dealChat}`);
    expect((await loader.load({ subject: "x", dealId: ids.withChat })).locale).toBe("kk");
    expect((await loader.load({ subject: "x", conversationId: ids.dealChat })).locale).toBe("kk");
    expect((await loader.load({ subject: "x", clientId: ids.client })).locale).toBe("kk");
    await q(sql`update crm_conversations set bot_state = null where id = ${ids.dealChat}`);
  });

  it("сообщение о заказе — в WhatsApp, и через Wazzup (wapi) тоже; письмо — не WhatsApp", async () => {
    expect(await loader.latestWhatsapp(ids.withChat, ids.client)).toBe(ids.wapi);
    expect(await loader.latestWhatsapp(ids.fresh, null)).toBeNull();
    expect(await loader.latestWhatsapp(ids.withChat, null)).toBe(ids.dealChat);
  });
});
