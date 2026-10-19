import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@/shared/infrastructure/db";
import { SqlScheduledSource } from "@/modules/automation/infrastructure/persistence";

/**
 * Выборки правил по времени на PostgreSQL (automation-d4): порядок, исключение объектов, по которым правило уже
 * сработало (тот же subject, что ставит движок), и лимит.
 * Запуск: INTEGRATION=1 npx vitest run tests/automation-scheduled.integration.test.ts (база из DATABASE_URL с миграциями).
 */
const run = process.env.INTEGRATION === "1" ? describe : describe.skip;
const tag = `as${Date.now()}`;

run("automation: выборки правил по времени (PostgreSQL)", () => {
  const source = new SqlScheduledSource();
  const q = async <T extends Record<string, unknown>>(query: ReturnType<typeof sql>) => (await db.execute<T>(query)).rows;
  const ids: Record<string, string> = {};
  const one = async (query: ReturnType<typeof sql>) => (await q<{ id: string }>(query))[0].id;
  const claim = (ruleId: string, subject: string) => q(sql`insert into crm_automation_runs (automation_id, subject) values (${ruleId}, ${subject})`);
  const mine = <T extends object>(rows: T[], key: keyof T, ...want: string[]) => rows.filter((r) => want.includes(String(r[key])));

  beforeAll(async () => {
    ids.rule = await one(sql`insert into crm_automations (name, trigger, active) values (${tag}, 'message.unanswered', false) returning id`);
    ids.other = await one(sql`insert into crm_automations (name, trigger, active) values (${tag + "-2"}, 'message.unanswered', false) returning id`);
    ids.open = await one(sql`select id from crm_stages where kind = 'open' order by position limit 1`);
    for (const key of ["old", "fresh", "claimed"]) ids[`conv-${key}`] = await one(sql`insert into crm_conversations (channel, chat_id, contact_name) values ('whatsapp', ${`${tag}-${key}`}, ${tag}) returning id`);
    await q(sql`update crm_conversations set awaiting_since = now() - interval '3 hours' where id = ${ids["conv-old"]}`);
    await q(sql`update crm_conversations set awaiting_since = now() - interval '1 hour' where id = ${ids["conv-fresh"]}`);
    await q(sql`update crm_conversations set awaiting_since = '2026-10-01T06:00:00.123456Z' where id = ${ids["conv-claimed"]}`);
    // Клиент забросил книгу: открытая сделка, черновик, давно не заходил.
    for (const key of ["a", "b"]) {
      ids[`user-${key}`] = await one(sql`insert into users (email, password_hash, name, last_seen_at) values (${`${tag}-${key}@test.kz`}, 'x', ${tag}, now() - interval '10 days' - ${key === "a" ? sql`interval '1 day'` : sql`interval '0 days'`}) returning id`);
      await q(sql`insert into books (user_id, theme, status) values (${ids[`user-${key}`]}, 'mom', 'draft')`);
      ids[`deal-${key}`] = await one(sql`insert into crm_deals (title, stage_id, client_id) values (${tag}, ${ids.open}, ${ids[`user-${key}`]}) returning id`);
    }
    // Годовщина: оплаченный год назад заказ к поводу, до которого теперь 20 дней.
    ids.buyer = await one(sql`insert into users (email, password_hash, name) values (${`${tag}-buyer@test.kz`}, 'x', ${tag}) returning id`);
    const book = await one(sql`insert into books (user_id, theme, occasion, occasion_date) values (${ids.buyer}, 'mom', 'birthday', (current_date - interval '1 year' + interval '20 days')::date) returning id`);
    ids.order = await one(sql`
      insert into orders (user_id, book_id, plan, items_amount, amount, currency, payment_provider, contact_name, contact_email, contact_phone, status, paid_at)
      values (${ids.buyer}, ${book}, 'hardcover', 20000, 20000, 'KZT', 'cloudpayments', ${tag}, ${`${tag}@test.kz`}, '77010000000', 'paid', now() - interval '1 year')
      returning id`);
  });

  afterAll(async () => {
    await q(sql`delete from crm_automations where name like ${tag + "%"}`);
    await q(sql`delete from crm_conversations where contact_name = ${tag}`);
    await q(sql`delete from orders where contact_name = ${tag}`);
    await q(sql`delete from crm_deals where title = ${tag}`);
    await q(sql`delete from users where name = ${tag}`);
    await pool.end();
  });

  it("«не ответили»: дольше всех ждущие — первыми; диалог, по которому правило сработало за это ожидание, не выбирается — для другого правила выбирается", async () => {
    const before = await source.unanswered(ids.rule, new Date());
    expect(mine(before, "conversationId", ids["conv-old"], ids["conv-fresh"], ids["conv-claimed"]).map((r) => r.conversationId)).toEqual([ids["conv-claimed"], ids["conv-old"], ids["conv-fresh"]]);
    // Subject — как в движке: `${id}:${awaitingSince.toISOString()}` (миллисекунды, микросекунды отброшены).
    const claimed = before.find((r) => r.conversationId === ids["conv-claimed"])!;
    expect(claimed.awaitingSince.toISOString()).toBe("2026-10-01T06:00:00.123Z");
    await claim(ids.rule, `${claimed.conversationId}:${claimed.awaitingSince.toISOString()}`);
    expect(mine(await source.unanswered(ids.rule, new Date()), "conversationId", ids["conv-claimed"])).toEqual([]);
    expect(mine(await source.unanswered(ids.other, new Date()), "conversationId", ids["conv-claimed"])).toHaveLength(1);
  });

  it("«забросил книгу»: недавно ушедшие — первыми, сработавшая сделка не выбирается", async () => {
    const rows = mine(await source.inactiveClients(ids.rule, 5), "dealId", ids["deal-a"], ids["deal-b"]);
    expect(rows.map((r) => r.dealId)).toEqual([ids["deal-b"], ids["deal-a"]]);
    await claim(ids.rule, `${rows[0].dealId}:${rows[0].lastSeen.toISOString()}`);
    expect(mine(await source.inactiveClients(ids.rule, 5), "dealId", ids["deal-a"], ids["deal-b"]).map((r) => r.dealId)).toEqual([ids["deal-a"]]);
  });

  it("годовщина: заказ, по которому правило сработало в этом году, не выбирается", async () => {
    const [row] = mine(await source.anniversaries(ids.rule, 30), "orderId", ids.order);
    expect(row).toMatchObject({ clientId: ids.buyer, occasion: "День рождения" });
    await claim(ids.rule, `${row.orderId}:${row.year}`);
    expect(mine(await source.anniversaries(ids.rule, 30), "orderId", ids.order)).toEqual([]);
  });
});
