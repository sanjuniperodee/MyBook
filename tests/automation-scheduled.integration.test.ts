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
    ids["deal-kk"] = await wonDeal(ids.kk, { event_date: "2025-11-15", occasion: "Годовщина", recipient: "Ержан" });
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

    // Праздник: Новый год 31.12.2026, покупки к нему — 01.12–31.12.2025, «уже купил в этом сезоне» — с 01.11.2026.
    ids.hbOrder = await user("hb-order");
    await order(ids.hbOrder, { occasion: "newyear", date: "2025-12-31", paidAt: "2025-12-20T10:00:00Z" });
    ids.hbDeal = await user("hb-deal", { locale: "kk" });
    await q(sql`update crm_deals set amount = 25000 where id = ${await wonDeal(ids.hbDeal, {}, "2025-12-10T10:00:00Z")}`);
    ids.hbPayment = await user("hb-payment");
    const paidDeal = await wonDeal(ids.hbPayment, {}, "2026-01-15T10:00:00Z");
    await q(sql`insert into crm_payments (deal_id, client_id, amount, kind, paid_at) values (${paidDeal}, ${ids.hbPayment}, 12000, 'prepayment', '2025-12-05T10:00:00Z')`);
    ids.hbOpen = await user("hb-open");
    await order(ids.hbOpen, { occasion: "newyear", date: "2025-12-31", paidAt: "2025-12-15T10:00:00Z" });
    await q(sql`insert into crm_deals (title, stage_id, client_id) values (${tag}, ${ids.open}, ${ids.hbOpen})`);
    ids.hbSeason = await user("hb-season");
    await order(ids.hbSeason, { occasion: "newyear", date: "2025-12-31", paidAt: "2025-12-18T10:00:00Z" });
    await order(ids.hbSeason, { occasion: "birthday", date: "2026-11-20", paidAt: "2026-11-10T10:00:00Z" });
    ids.hbQuiet = await user("hb-quiet", { phone: "+7 (701) 555-00-22" });
    await order(ids.hbQuiet, { occasion: "newyear", date: "2025-12-31", paidAt: "2025-12-12T10:00:00Z" });
    await q(sql`insert into crm_blocklist (value, reason, note) values ('77015550022', 'no_marketing', ${tag})`);
    ids.hbEarly = await user("hb-early");
    await order(ids.hbEarly, { occasion: "birthday", date: "2025-11-25", paidAt: "2025-11-20T10:00:00Z" });

    // «Успеть к дате» (deals-28): даты события в 2031 году, окно 25.02–05.03.2031.
    ids.lost = await one(sql`select id from crm_stages where kind = 'lost' order by position limit 1`);
    const soon = async (key: string, eventDate: string | null, o: { stage?: string; unsorted?: boolean; occasion?: string; locale?: string } = {}) => {
      ids[`ed-${key}-user`] = await user(`ed-${key}`, { locale: o.locale });
      const fields = { ...(eventDate ? { event_date: eventDate } : {}), ...(o.occasion ? { occasion: o.occasion } : {}) };
      return (ids[`ed-${key}`] = await one(sql`insert into crm_deals (title, stage_id, client_id, custom_fields, unsorted)
        values (${tag}, ${o.stage ?? ids.open}, ${ids[`ed-${key}-user`]}, ${JSON.stringify(fields)}::jsonb, ${o.unsorted ?? false}) returning id`));
    };
    const book = async (userId: string, theme: string, answers: string[]) => {
      const id = await one(sql`insert into books (user_id, theme) values (${userId}, ${theme}) returning id`);
      for (const [i, answer] of answers.entries()) await q(sql`insert into book_questions (book_id, position, chapter, prompt, title, answer) values (${id}, ${i}, 'c', 'p', 't', ${answer})`);
      return id;
    };
    const pay = (dealId: string, amount: number, kind = "prepayment") => q(sql`insert into crm_payments (deal_id, amount, kind) values (${dealId}, ${amount}, ${kind})`);
    // Своя книга: 1600 слов из 3000 — 53%.
    await soon("blank", "2031-02-26");
    await book(ids["ed-blank-user"], "blank", ["слово ".repeat(1600)]);
    await pay(await soon("paid", "2031-02-27"), 5000);
    // Книга с вопросами: 2 ответа из 4 — 50%; пустой ответ из пробелов — не ответ.
    await soon("half", "2031-02-28");
    await book(ids["ed-half-user"], "mom", ["Ответ", "Ещё ответ", " \n ", ""]);
    await soon("nobook", "2031-03-01", { occasion: "День рождения", locale: "kk" });
    // Заказ сделки оплачен и уже в печати: оплачено, книга готова (хотя ответов мало).
    await soon("order", "2031-03-02");
    const printedBook = await book(ids["ed-order-user"], "mom", ["Ответ", "", "", ""]);
    const printed = await one(sql`
      insert into orders (user_id, book_id, plan, items_amount, amount, currency, payment_provider, contact_name, contact_email, contact_phone, status, paid_at)
      values (${ids["ed-order-user"]}, ${printedBook}, 'hardcover', 20000, 20000, 'KZT', 'cloudpayments', ${tag}, ${`${tag}@test.kz`}, '77010000000', 'in_production', now())
      returning id`);
    await q(sql`update crm_deals set order_id = ${printed} where id = ${ids["ed-order"]}`);
    // Предоплату вернули — денег по сделке нет.
    await soon("refunded", "2031-03-03");
    await pay(ids["ed-refunded"], 5000);
    await pay(ids["ed-refunded"], 5000, "refund");
    // Пакет из двух сделок: деньги приняты по второй — первая тоже оплачена.
    await soon("batch", "2031-03-04");
    const batch = await one(sql`select gen_random_uuid() as id`);
    const second = await one(sql`insert into crm_deals (title, stage_id, client_id, batch_id, batch_index, batch_size) values (${tag}, ${ids.open}, ${ids["ed-batch-user"]}, ${batch}, 1, 2) returning id`);
    await q(sql`update crm_deals set batch_id = ${batch}, batch_index = 0, batch_size = 2 where id = ${ids["ed-batch"]}`);
    await pay(second, 20000);
    // Не выбираются: неверная дата, за окном, закрытая сделка, «неразобранная» заявка.
    await soon("bad", "2031-02-30");
    await soon("far", "2031-03-06");
    await soon("lost", "2031-03-01", { stage: ids.lost });
    await soon("unsorted", "2031-03-01", { unsorted: true });
  });

  const user = (key: string, o: { locale?: string; phone?: string } = {}) =>
    one(sql`insert into users (email, password_hash, name, locale, phone) values (${`${tag}-${key}@test.kz`}, 'x', ${tag}, ${o.locale ?? "ru"}, ${o.phone ?? null}) returning id`);
  const order = async (userId: string, o: { occasion: string; date: string; paidAt: string }) => {
    const book = await one(sql`insert into books (user_id, theme, occasion, occasion_date, recipient_name) values (${userId}, 'mom', ${o.occasion}, ${o.date}, 'Мама') returning id`);
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
    await q(sql`delete from crm_payments where deal_id in (select id from crm_deals where title = ${tag})`);
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
      { orderId: null, dealId: ids["deal-kk"], clientId: ids.kk, occasion: "Годовщина", date: "15 ноября 2026 г.", year: 2026, recipient: "Ержан", client: { occasion: "Жылдық", date: expect.stringContaining("2026") } },
      { orderId: ids.order, dealId: null, clientId: ids.buyer, occasion: "День рождения", date: "20 ноября 2026 г.", year: 2026, recipient: "Мама", client: { occasion: "День рождения", date: "20 ноября 2026 г." } },
    ]);
  });

  it("годовщина: покупка, по которой правило сработало в этом году, не выбирается — subject как в движке", async () => {
    await claim(ids.rule, `${ids.order}:2026`);
    await claim(ids.rule, `deal:${ids["deal-kk"]}:2026`);
    expect(await anniversaries()).toEqual([]);
    expect((await source.anniversaries(ids.other, "2026-11-01", 30)).filter((r) => r.clientId === ids.kk)).toHaveLength(1);
  });

  const ny = { holiday: { id: "newyear", date: "12-31", ru: "Новый год", kk: "Жаңа жыл" }, date: "2026-12-31", from: "2025-12-01", to: "2025-12-31", seasonFrom: "2026-11-01" };
  const holidayBuyers = async (limit = 200, ruleId = ids.rule) =>
    (await source.holidayBuyers(ruleId, { ...ny, limit })).filter((r) => [ids.hbOrder, ids.hbDeal, ids.hbPayment, ids.hbOpen, ids.hbSeason, ids.hbQuiet, ids.hbEarly].includes(r.clientId));

  it("праздник: покупатели прошлого года — заказ, выигранная сделка из чата, платёж по сделке; купившие ближе к празднику — первыми", async () => {
    expect(await holidayBuyers()).toEqual([
      { clientId: ids.hbOrder, occasion: "Новый год", date: "31 декабря 2026 г.", client: { occasion: "Новый год", date: "31 декабря 2026 г." } },
      { clientId: ids.hbDeal, occasion: "Новый год", date: "31 декабря 2026 г.", client: { occasion: "Жаңа жыл", date: expect.stringContaining("2026") } },
      { clientId: ids.hbPayment, occasion: "Новый год", date: "31 декабря 2026 г.", client: { occasion: "Новый год", date: "31 декабря 2026 г." } },
    ]);
    expect((await holidayBuyers(2)).map((r) => r.clientId)).toEqual([ids.hbOrder, ids.hbDeal]);
  });

  const window = { from: "2031-02-25", to: "2031-03-05" };
  const soonKeys = ["blank", "paid", "half", "nobook", "order", "refunded", "batch", "bad", "far", "lost", "unsorted"];
  const eventDates = async (o: { bookBelow?: number; unpaid?: boolean } = {}, ruleId = ids.rule) =>
    (await source.eventDates(ruleId, { ...window, bookBelow: o.bookBelow ?? null, unpaid: o.unpaid ?? false }))
      .filter((r) => soonKeys.some((k) => ids[`ed-${k}`] === r.dealId))
      .map((r) => soonKeys.find((k) => ids[`ed-${k}`] === r.dealId));

  it("«успеть к дате»: открытые сделки с датой в окне, ближайшие первыми; неверная дата, за окном, закрытые и «неразобранные» — нет", async () => {
    expect(await eventDates()).toEqual(["blank", "paid", "half", "nobook", "order", "refunded", "batch"]);
    const [nobook] = (await source.eventDates(ids.rule, { ...window, bookBelow: null, unpaid: false })).filter((r) => r.dealId === ids["ed-nobook"]);
    expect(nobook).toEqual({ dealId: ids["ed-nobook"], clientId: ids["ed-nobook-user"], eventDate: "2031-03-01", occasion: "День рождения", date: "1 марта 2031 г.", client: { occasion: expect.not.stringContaining("День"), date: expect.stringContaining("2031") } });
  });

  it("«успеть к дате»: «ничего не оплачено» — без оплаченного заказа и без денег по сделке и её пакету; возврат денег — снова не оплачено", async () => {
    expect(await eventDates({ unpaid: true })).toEqual(["blank", "half", "nobook", "refunded"]);
  });

  it("«успеть к дате»: книга заполнена меньше X% — как полоска в CRM; нет книги — 0%, заказ в печати — книга готова", async () => {
    expect(await eventDates({ bookBelow: 50 })).toEqual(["paid", "nobook", "refunded", "batch"]);
    expect(await eventDates({ bookBelow: 60 })).toEqual(["blank", "paid", "half", "nobook", "refunded", "batch"]);
    expect(await eventDates({ bookBelow: 60, unpaid: true })).toEqual(["blank", "half", "nobook", "refunded"]);
  });

  it("«успеть к дате»: сделка, для которой правило сработало на эту дату, не выбирается — subject как в движке; для другого правила — выбирается", async () => {
    await claim(ids.rule, `deal:${ids["ed-nobook"]}:event_date:2031-03-01`);
    expect(await eventDates({ unpaid: true })).toEqual(["blank", "half", "refunded"]);
    expect(await eventDates({ unpaid: true }, ids.other)).toEqual(["blank", "half", "nobook", "refunded"]);
    // Дату перенесли — правило сработает снова.
    await q(sql`update crm_deals set custom_fields = custom_fields || '{"event_date": "2031-03-02"}'::jsonb where id = ${ids["ed-nobook"]}`);
    expect(await eventDates({ unpaid: true })).toEqual(["blank", "half", "nobook", "refunded"]);
  });

  it("праздник: клиент, для которого правило сработало к этому празднику, не выбирается; счёт срабатываний за сегодня", async () => {
    await claim(ids.rule, `holiday:newyear:2026:${ids.hbOrder}`);
    expect((await holidayBuyers()).map((r) => r.clientId)).toEqual([ids.hbDeal, ids.hbPayment]);
    expect((await holidayBuyers(200, ids.other)).map((r) => r.clientId)).toEqual([ids.hbOrder, ids.hbDeal, ids.hbPayment]);
    const [{ today }] = await q<{ today: string }>(sql`select to_char((now() at time zone 'Asia/Almaty')::date, 'YYYY-MM-DD') as today`);
    const fired = await source.firedOn(ids.rule, today);
    expect(fired).toBeGreaterThanOrEqual(1);
    await claim(ids.rule, `holiday:newyear:2026:${tag}`);
    expect(await source.firedOn(ids.rule, today)).toBe(fired + 1);
    expect(await source.firedOn(ids.rule, "2099-01-01")).toBe(0);
  });
});
