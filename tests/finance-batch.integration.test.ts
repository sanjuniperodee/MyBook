import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@/shared/infrastructure/db";
import { financeDeals, financeMoney, financeReview } from "@/modules/reporting/infrastructure/Finance";
import { financePeriod, financeScreen } from "@/modules/reporting/ui/finance-screen";
import { dealRefundAfterOrder } from "@/modules/sales/infrastructure/agreements";

/**
 * «Финансы» на PostgreSQL — случаи, которые раньше считались неверно:
 * - пакет из нескольких книг (платёж в первой сделке): ни ложной переплаты у первой, ни «ожидается» у остальных;
 * - заказ сделки отменён, а предоплата по сделке у нас — «нужен возврат», и его можно оформить (лимит возврата);
 * - пакеты ИИ-дизайнера и минут видео — в «Пришло»; ручной возврат — в «Проверить».
 * Запуск: INTEGRATION=1 npx vitest run tests/finance-batch.integration.test.ts (база из DATABASE_URL с применёнными миграциями).
 */
const run = process.env.INTEGRATION === "1" ? describe : describe.skip;
const tag = `finb${Date.now()}`;

run("Финансы: пакеты книг, отменённый заказ, пакеты ИИ (PostgreSQL)", () => {
  const ids: Record<string, string> = {};
  const q = async <T extends Record<string, unknown>>(query: ReturnType<typeof sql>) => (await db.execute<T>(query)).rows;
  const hourAgo = new Date(Date.now() - 3600_000);
  const range = { from: new Date(Date.now() - 2 * 86_400_000), to: new Date(Date.now() + 3600_000) };
  const batch = crypto.randomUUID();

  beforeAll(async () => {
    const [open] = await q<{ id: string }>(sql`select id from crm_stages where kind = 'open' order by position limit 1`);
    const [mgr] = await q<{ id: string }>(sql`insert into users (email, password_hash, name, role) values (${tag + "m@t.kz"}, 'x', 'Менеджер', 'admin') returning id`);
    const [client] = await q<{ id: string }>(sql`insert into users (email, password_hash, name) values (${tag + "c@t.kz"}, 'x', 'Клиент') returning id`);
    Object.assign(ids, { open: open.id, mgr: mgr.id, client: client.id });
    const [book] = await q<{ id: string }>(sql`insert into books (user_id, theme, title, author_name, recipient_name) values (${client.id}, 'love', 'Т', 'А', 'Б') returning id`);
    ids.book = book.id;
    const deal = async (key: string, o: { amount: number; batchIndex?: number; batchSize?: number }) => {
      const [d] = await q<{ id: string }>(sql`
        insert into crm_deals (title, stage_id, amount, source, assignee_id, contact_name, batch_id, batch_index, batch_size)
        values (${tag + key}, ${open.id}, ${o.amount}, 'manual', ${mgr.id}, ${"К " + key}, ${o.batchSize ? batch : null}, ${o.batchIndex ?? null}, ${o.batchSize ?? null}) returning id`);
      ids[key] = d.id;
    };
    const pay = async (key: string, deal: string, amount: number, kind = "payment") => {
      const [p] = await q<{ id: string }>(sql`
        insert into crm_payments (deal_id, amount, kind, method, paid_at, created_by_id)
        values (${ids[deal]}, ${amount}, ${kind}, 'manual', ${hourAgo.toISOString()}::timestamptz, ${mgr.id}) returning id`);
      ids[key] = p.id;
    };

    // Пакет из 3 книг по 30 000: всё оплачено (90 000) в первой сделке.
    await deal("b0", { amount: 30000, batchIndex: 0, batchSize: 3 });
    await deal("b1", { amount: 30000, batchIndex: 1, batchSize: 3 });
    await deal("b2", { amount: 30000, batchIndex: 2, batchSize: 3 });
    await pay("payB", "b0", 90000);
    // Второй пакет из 2 книг по 10 000, оплачено 25 000 — переплата 5 000 делится по книгам (2 500 + 2 500).
    const batch2 = crypto.randomUUID();
    for (const [key, i] of [
      ["p0", 0],
      ["p1", 1],
    ] as const) {
      const [d] = await q<{ id: string }>(sql`
        insert into crm_deals (title, stage_id, amount, source, assignee_id, contact_name, batch_id, batch_index, batch_size)
        values (${tag + key}, ${open.id}, 10000, 'manual', ${mgr.id}, ${"К " + key}, ${batch2}, ${i}, 2) returning id`);
      ids[key] = d.id;
    }
    await pay("payP", "p0", 25000);

    // Сделка с предоплатой 6 000, заказ по ней отменён.
    await deal("x", { amount: 10000 });
    await pay("payX", "x", 6000, "prepayment");
    const [ord] = await q<{ id: string }>(sql`
      insert into orders (user_id, book_id, plan, items_amount, prepaid_amount, amount, currency, status, payment_provider, contact_name, contact_phone, contact_email)
      values (${client.id}, ${book.id}, 'print', 10000, 6000, 4000, 'KZT', 'cancelled', 'manual', ${tag + "ox"}, '7', 'a@b.kz') returning id`);
    ids.ox = ord.id;
    await q(sql`update crm_deals set order_id = ${ord.id} where id = ${ids.x}`);
    // Сделка с живым заказом: внесено 12 000, в заказе учтено 10 000 — лишние 2 000.
    await deal("y", { amount: 10000 });
    await pay("payY", "y", 12000);
    const [ordY] = await q<{ id: string }>(sql`
      insert into orders (user_id, book_id, plan, items_amount, prepaid_amount, amount, currency, status, payment_provider, contact_name, contact_phone, contact_email)
      values (${client.id}, ${book.id}, 'print', 10000, 10000, 0, 'KZT', 'paid', 'manual', ${tag + "oy"}, '7', 'a@b.kz') returning id`);
    ids.oy = ordY.id;
    await q(sql`update crm_deals set order_id = ${ordY.id} where id = ${ids.y}`);
    // Ручной возврат 1 000 по сделке y — должен попасть в «Проверить».
    await pay("refY", "y", 1000, "refund");

    // Оплаченный пакет ИИ-дизайнера и минут видео.
    const [ap] = await q<{ id: string }>(sql`
      insert into design_ai_purchases (user_id, pack_id, requests, amount, status, payment_id, paid_at)
      values (${client.id}, 'p10', 10, 2900, 'paid', ${"kaspi:" + tag + "a"}, ${hourAgo.toISOString()}::timestamptz) returning id`);
    ids.ap = ap.id;
    const [mp] = await q<{ id: string }>(sql`
      insert into answer_file_purchases (user_id, book_id, pack_id, minutes, amount, status, payment_id, paid_at)
      values (${client.id}, ${book.id}, 'm10', 10, 1500, 'paid', ${"kaspi:" + tag + "m"}, ${hourAgo.toISOString()}::timestamptz) returning id`);
    ids.mp = mp.id;
  });

  afterAll(async () => {
    await q(sql`delete from crm_deals where title like ${tag + "%"}`);
    await q(sql`delete from orders where contact_name like ${tag + "%"}`);
    await q(sql`delete from design_ai_purchases where user_id = ${ids.client}`);
    await q(sql`delete from answer_file_purchases where user_id = ${ids.client}`);
    await q(sql`delete from books where user_id in (select id from users where email like ${tag + "%"})`);
    await q(sql`delete from users where email like ${tag + "%"}`);
    await pool.end();
  });

  const screenOf = async () => {
    const deals = (await financeDeals()).filter((d) => Object.values(ids).includes(d.id));
    return {
      deals,
      s: financeScreen({
        period: financePeriod({ preset: "today", now: new Date(), tz: "Asia/Almaty" }),
        money: [],
        deals,
        orders: [],
        unrecorded: [],
        review: [],
        staff: [{ id: ids.mgr, name: "Менеджер", email: "m@t.kz" }],
        tz: "Asia/Almaty",
        now: new Date(),
      }),
    };
  };

  it("пакет книг: деньги делятся по книгам — полностью оплаченный пакет не даёт ни переплаты, ни «ожидается»", async () => {
    const { deals, s } = await screenOf();
    // Полностью оплаченные книги пакета даже не выбираются (подзапрос книги не считается зря).
    expect(deals.some((d) => [ids.b0, ids.b1, ids.b2].includes(d.id))).toBe(false);
    const refs = (key: string) => `Сделка Д${deals.find((d) => d.id === ids[key])?.number}`;
    expect(s.expected.rows.some((r) => [ids.b0, ids.b1, ids.b2].some((id) => r.href.endsWith(id)))).toBe(false);
    // Переплата второго пакета — по книгам: 12 500 − 10 000 у каждой.
    const over = s.issues.filter((i) => i.kind === "deal_overpaid").map((i) => [i.ref, i.amount]);
    expect(over.sort()).toEqual(
      [
        [refs("p0"), 2500],
        [refs("p1"), 2500],
      ].sort(),
    );
  });

  it("заказ отменён, предоплата по сделке у нас — «нужен возврат»; лишнее после живого заказа — тоже; лимит возврата", async () => {
    const { s, deals } = await screenOf();
    const n = (key: string) => deals.find((d) => d.id === ids[key])?.number;
    expect(s.issues.find((i) => i.ref === `Сделка Д${n("x")}`)).toMatchObject({ kind: "deal_lost", amount: 6000 });
    expect(s.issues.find((i) => i.ref === `Сделка Д${n("y")}`)).toMatchObject({ kind: "deal_after_order", amount: 1000 });
    // Отменённый заказ — можно вернуть всё внесённое по сделке; живой — только лишнее (12 000 − 1 000 возврата − 10 000).
    expect(await dealRefundAfterOrder(ids.x)).toBe(6000);
    expect(await dealRefundAfterOrder(ids.y)).toBe(1000);
    expect(await dealRefundAfterOrder(ids.b1)).toBeNull();
  });

  it("пакеты ИИ и минут видео — в «Пришло»; ручной возврат — в «Проверить»", async () => {
    const money = (await financeMoney(range.from, range.to)).filter((m) => m.id === ids.ap || m.id === ids.mp);
    expect(money.map((m) => [m.source, m.kind, m.method, m.amount]).sort()).toEqual(
      [
        ["pack", "ai_pack", "kaspi", 2900],
        ["pack", "media_pack", "kaspi", 1500],
      ].sort(),
    );
    const review = await financeReview();
    expect(review.find((r) => r.id === ids.refY)).toMatchObject({ paymentKind: "refund", amount: 1000 });
  });
});
