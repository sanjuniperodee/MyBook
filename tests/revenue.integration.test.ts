import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@/shared/infrastructure/db";
import { currentMonth } from "@/modules/sales";
import { SalesModule } from "@/modules/sales";

/**
 * Интеграционный тест единого журнала выручки (вьюха revenue_events) и того, что на ней построено: LTV клиента и план месяца.
 * Запуск: INTEGRATION=1 npx vitest run tests/revenue.integration.test.ts (нужна база из DATABASE_URL с применёнными миграциями).
 */
const run = process.env.INTEGRATION === "1" ? describe : describe.skip;
const tag = `rv${Date.now()}`;

run("журнал выручки (PostgreSQL)", () => {
  const ids: Record<string, string> = {};
  const q = async <T extends Record<string, unknown>>(query: ReturnType<typeof sql>) => (await db.execute<T>(query)).rows;

  beforeAll(async () => {
    const [stage] = await q<{ id: string; kind: string }>(sql`select id, kind from crm_stages where kind = 'won' limit 1`);
    const [open] = await q<{ id: string }>(sql`select id from crm_stages where kind = 'open' order by position limit 1`);
    const [mgr] = await q<{ id: string }>(sql`insert into users (email, password_hash, name, role) values (${tag + "m@t.kz"}, 'x', 'Менеджер', 'admin') returning id`);
    const [client] = await q<{ id: string }>(sql`insert into users (email, password_hash, name) values (${tag + "c@t.kz"}, 'x', 'Клиент') returning id`);
    Object.assign(ids, { won: stage.id, open: open.id, mgr: mgr.id, client: client.id });
    const deal = async (key: string, stageId: string, amount: number, opts: { closed?: boolean } = {}) => {
      const [d] = await q<{ id: string }>(sql`
        insert into crm_deals (title, stage_id, amount, client_id, assignee_id, contact_name, closed_at)
        values (${tag + key}, ${stageId}, ${amount}, ${client.id}, ${mgr.id}, 'К', ${opts.closed ? sql`now()` : sql`null`}) returning id`);
      ids[key] = d.id;
    };
    await deal("prepaid", open.id, 20000); // открытая, предоплата 10 000 + доплата 5 000
    await deal("closedNoMoney", stage.id, 7000, { closed: true }); // успешная без заказа и платежей — продали в чате
    await deal("closedWithPay", stage.id, 9000, { closed: true }); // успешная, но деньги — платежами
    await deal("openNoMoney", open.id, 50000); // просто лид с суммой
    await q(sql`update crm_deals set source = 'site' where id = ${ids.openNoMoney}`); // с сайта — договорённостью менеджера не считается
    const pay = (deal: string, amount: number) => q(sql`insert into crm_payments (deal_id, client_id, amount, kind) values (${ids[deal]}, ${client.id}, ${amount}, 'payment')`);
    await pay("prepaid", 10000);
    await pay("prepaid", 5000);
    await pay("closedWithPay", 4000);
  });

  afterAll(async () => {
    await q(sql`delete from crm_deals where title like ${tag + "%"}`);
    await q(sql`delete from users where email like ${tag + "%"}`);
    await pool.end();
  });

  const events = () => q<{ kind: string; amount: number; deal_id: string }>(sql`select kind, amount, deal_id from revenue_events where client_id = ${ids.client} order by amount`);

  it("деньги считаются платежами, а успешная сделка без денег — по сумме; лид с суммой — не выручка", async () => {
    const e = await events();
    expect(e.map((x) => [x.kind, x.amount])).toEqual([
      ["payment", 4000],
      ["payment", 5000],
      ["deal", 7000],
      ["payment", 10000],
    ]);
    expect(e.reduce((s, x) => s + x.amount, 0)).toBe(26000);
  });

  it("сделка с платежами не считается второй раз, когда её закрывают", async () => {
    await q(sql`update crm_deals set stage_id = ${ids.won}, closed_at = now() where id = ${ids.prepaid}`);
    const e = await events();
    expect(e.filter((x) => x.deal_id === ids.prepaid).map((x) => [x.kind, x.amount])).toEqual([
      ["payment", 5000],
      ["payment", 10000],
    ]);
    expect(e.reduce((s, x) => s + x.amount, 0)).toBe(26000);
  });

  it("заказ по договорённости хранит только «к оплате»: платежи считаются всегда, итог = платежи + остаток, продажа одна", async () => {
    const [book] = await q<{ id: string }>(sql`insert into books (user_id, theme, title, author_name, recipient_name) values (${ids.client}, 'love', 'Т', 'А', 'Б') returning id`);
    // договорились на 20 000, внесено 15 000 → заказ на остаток 5 000 (prepaid_amount = 15 000)
    const [order] = await q<{ id: string }>(sql`
      insert into orders (user_id, book_id, plan, items_amount, prepaid_amount, amount, currency, status, payment_provider, contact_name, contact_phone, contact_email, paid_at)
      values (${ids.client}, ${book.id}, 'print', 20000, 15000, 5000, 'KZT', 'paid', 'manual', 'К', '7', 'a@b.kz', now()) returning id`);
    await q(sql`update crm_deals set order_id = ${order.id} where id = ${ids.prepaid}`);
    const e = (await events()).filter((x) => x.deal_id === ids.prepaid);
    expect(e.map((x) => [x.kind, x.amount]).sort()).toEqual([["order", 5000], ["payment", 10000], ["payment", 5000]].sort());
    expect(e.reduce((s, x) => s + x.amount, 0)).toBe(20000);
    const [{ sales }] = await q<{ sales: number }>(sql`select count(distinct sale_id)::int as sales from revenue_events where deal_id = ${ids.prepaid}`);
    expect(sales).toBe(1);
    // заказ отменён — остаток не считается, внесённые менеджеру деньги остаются
    await q(sql`update orders set status = 'cancelled' where id = ${order.id}`);
    expect((await events()).filter((x) => x.deal_id === ids.prepaid).reduce((s, x) => s + x.amount, 0)).toBe(15000);
    await q(sql`update crm_deals set order_id = null where id = ${ids.prepaid}`);
    await q(sql`delete from orders where id = ${order.id}`);
    await q(sql`delete from books where id = ${book.id}`);
  });

  it("возврат клиенту — платёж refund: в выручке со знаком минус, договорённость видит только чистую сумму", async () => {
    const sales = new SalesModule({ uow: { run: async (f: () => Promise<unknown>) => f(), track: () => {} }, clock: { now: () => new Date() }, logger: { info() {}, warn() {}, error() {} } } as never);
    // возврат больше принятого и сумма не по делу — отказ; нормальный возврат записывается
    await expect(sales.payments.refund({ dealId: ids.prepaid, clientId: ids.client, amount: 999_999, note: "тест", createdById: ids.mgr })).rejects.toMatchObject({ code: "refundTooBig" });
    await expect(sales.payments.refund({ dealId: ids.prepaid, clientId: ids.client, amount: 0, note: "тест", createdById: ids.mgr })).rejects.toMatchObject({ code: "amount" });
    await sales.payments.refund({ dealId: ids.prepaid, clientId: ids.client, amount: 3000, note: "тест", createdById: ids.mgr });
    expect(await sales.payments.paidTotal(ids.prepaid)).toBe(12000);
    const e = (await events()).filter((x) => x.deal_id === ids.prepaid);
    expect(e.map((x) => [x.kind, x.amount]).sort()).toEqual([["payment", 10000], ["payment", 5000], ["refund", -3000]].sort());
    expect(e.reduce((s, x) => s + x.amount, 0)).toBe(12000);
    const [open] = await q<{ id: string }>(sql`select id from crm_stages where kind = 'open' order by position limit 1`);
    await q(sql`update crm_deals set stage_id = ${open.id}, closed_at = null, source = 'manual', order_id = null where id = ${ids.prepaid}`);
    const { agreementForClient } = await import("@/modules/sales/infrastructure/agreements");
    expect(await agreementForClient(ids.client)).toMatchObject({ dealId: ids.prepaid, agreedTotal: 20000, prepaid: 12000 });
    await q(sql`delete from crm_payments where kind = 'refund' and deal_id = ${ids.prepaid}`);
  });

  it("план месяца: платежи — по деньгам, сделка засчитывается с первого платежа, закрытая сделка с платежами не удваивается", async () => {
    const sales = new SalesModule({ uow: { run: async (f: () => Promise<unknown>) => f(), track: () => {} }, clock: { now: () => new Date() }, logger: { info() {}, warn() {}, error() {} } } as never);
    const fact = (await sales.queries.planProgress(currentMonth(), [ids.mgr])).get(ids.mgr)!;
    // prepaid (платежи 10 000 + 5 000) + closedWithPay (платёж 4 000) — по деньгам; closedNoMoney — по сумме 7 000
    expect(fact.factAmount).toBe(10000 + 5000 + 4000 + 7000);
    // сделки: prepaid и closedWithPay — по первому платежу, closedNoMoney — как успешная
    expect(fact.factDeals).toBe(3);
  });
});
