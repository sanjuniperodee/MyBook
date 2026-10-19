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
    // Годовщины к «сегодня» 01.11.2026. Заказ сайта: оплачен в октябре 2025 к дню рождения 20.11.2025.
    ids.won = await one(sql`select id from crm_stages where kind = 'won' order by position limit 1`);
    ids.buyer = await user("buyer");
    ids.order = await order(ids.buyer, { occasion: "birthday", date: "2025-11-20", paidAt: "2025-10-25T10:00:00Z" });
    // Сделки, проданные в чате (выиграны, без оплаченного заказа), — повод и дата в своих полях сделки.
    ids.kk = await user("kk", { locale: "kk" });
    ids["deal-kk"] = await wonDeal(ids.kk, { event_date: "2025-11-15", occasion: "Годовщина" });
    // Купил снова после повода: оплаченный заказ весной — годовщины нет; выигранная сделка весной — тоже.
    ids.again = await user("again");
    ids["deal-again"] = await wonDeal(ids.again, { event_date: "2025-11-10", occasion: "Годовщина" });
    await order(ids.again, { occasion: "march8", date: "2026-03-08", paidAt: "2026-03-01T10:00:00Z" });
    ids.again2 = await user("again2");
    ids["deal-again2"] = await wonDeal(ids.again2, { event_date: "2025-11-12", occasion: "День рождения" });
    await wonDeal(ids.again2, { event_date: "2026-05-07" }, "2026-05-01T10:00:00Z");
    // Просил не писать первым: по номеру (записан как 8 701…) и по собеседнику диалога (Telegram).
    ids.quiet = await user("quiet", { phone: "8 701 555 00 11" });
    ids["deal-quiet"] = await wonDeal(ids.quiet, { event_date: "2025-11-18", occasion: "Свадьба" });
    ids.quietChat = await user("quietchat");
    ids["deal-quietChat"] = await wonDeal(ids.quietChat, { event_date: "2025-11-18", occasion: "Свадьба" });
    await q(sql`insert into crm_conversations (channel, chat_id, contact_name, client_id) values ('telegram', ${`${tag}-quiet`}, ${tag}, ${ids.quietChat})`);
    await q(sql`insert into crm_blocklist (value, reason, note) values ('77015550011', 'no_marketing', ${tag}), (${`${tag}-quiet`}, 'no_marketing', ${tag})`);
    // Неверная дата и выпускной — не годовщина; сделка с оплаченным заказом — уже годовщина заказа.
    ids.odd = await user("odd");
    ids["deal-bad"] = await wonDeal(ids.odd, { event_date: "2025-02-30", occasion: "Годовщина" });
    ids["deal-grad"] = await wonDeal(ids.odd, { event_date: "2025-11-20", occasion: "Выпускной" });
    ids["deal-site"] = await wonDeal(ids.buyer, { event_date: "2025-11-20", occasion: "День рождения" });
    await q(sql`update crm_deals set order_id = ${ids.order} where id = ${ids["deal-site"]}`);
  });

  const user = (key: string, o: { locale?: string; phone?: string } = {}) =>
    one(sql`insert into users (email, password_hash, name, locale, phone) values (${`${tag}-${key}@test.kz`}, 'x', ${tag}, ${o.locale ?? "ru"}, ${o.phone ?? null}) returning id`);
  const order = async (userId: string, o: { occasion: string; date: string; paidAt: string }) => {
    const book = await one(sql`insert into books (user_id, theme, occasion, occasion_date) values (${userId}, 'mom', ${o.occasion}, ${o.date}) returning id`);
    return one(sql`
      insert into orders (user_id, book_id, plan, items_amount, amount, currency, payment_provider, contact_name, contact_email, contact_phone, status, paid_at)
      values (${userId}, ${book}, 'hardcover', 20000, 20000, 'KZT', 'cloudpayments', ${tag}, ${`${tag}@test.kz`}, '77010000000', 'paid', ${o.paidAt})
      returning id`);
  };
  const wonDeal = (clientId: string, fields: Record<string, string>, closedAt = "2025-11-01T10:00:00Z") =>
    one(sql`insert into crm_deals (title, stage_id, client_id, custom_fields, closed_at) values (${tag}, ${ids.won}, ${clientId}, ${JSON.stringify(fields)}::jsonb, ${closedAt}) returning id`);

  afterAll(async () => {
    await q(sql`delete from crm_automations where name like ${tag + "%"}`);
    await q(sql`delete from crm_blocklist where note = ${tag}`);
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

  const anniversaries = async () => (await source.anniversaries(ids.rule, "2026-11-01", 30)).filter((r) => Object.values(ids).includes(r.orderId ?? r.dealId ?? ""));

  it("годовщины: заказ сайта и сделка из чата; ближайшие первыми; повод и дата клиенту — на его языке (contacts-16, automation-d6)", async () => {
    expect(await anniversaries()).toEqual([
      { orderId: null, dealId: ids["deal-kk"], clientId: ids.kk, occasion: "Годовщина", date: "15 ноября 2026 г.", year: 2026, client: { occasion: "Жылдық", date: expect.stringContaining("2026") } },
      { orderId: ids.order, dealId: null, clientId: ids.buyer, occasion: "День рождения", date: "20 ноября 2026 г.", year: 2026, client: { occasion: "День рождения", date: "20 ноября 2026 г." } },
    ]);
  });

  it("годовщина: покупка, по которой правило сработало в этом году, не выбирается — subject как в движке", async () => {
    await claim(ids.rule, `${ids.order}:2026`);
    await claim(ids.rule, `deal:${ids["deal-kk"]}:2026`);
    expect(await anniversaries()).toEqual([]);
    expect((await source.anniversaries(ids.other, "2026-11-01", 30)).filter((r) => r.clientId === ids.kk)).toHaveLength(1);
  });
});
