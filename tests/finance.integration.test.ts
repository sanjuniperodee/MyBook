import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@/shared/infrastructure/db";
import { financeDeals, financeMoney, financeOrders, financeReview, financeUnrecorded } from "@/modules/reporting/infrastructure/Finance";
import { financePeriod, financeScreen } from "@/modules/reporting/ui/finance-screen";
import { DealPayments } from "@/modules/sales/infrastructure/payments";

/**
 * «Финансы» на PostgreSQL: деньги считаются один раз (предоплата сделки + заказ с вычтенной предоплатой; старый
 * оплаченный заказ без журнала; частично записанный), ожидаемые доплаты, переплаты, оплаты Kaspi вне учёта, «Проверить».
 * Запуск: INTEGRATION=1 npx vitest run tests/finance.integration.test.ts (база из DATABASE_URL с применёнными миграциями).
 */
const run = process.env.INTEGRATION === "1" ? describe : describe.skip;
const tag = `fin${Date.now()}`;

run("Финансы: запросы (PostgreSQL)", () => {
  const ids: Record<string, string> = {};
  const q = async <T extends Record<string, unknown>>(query: ReturnType<typeof sql>) => (await db.execute<T>(query)).rows;
  const hourAgo = new Date(Date.now() - 3600_000);
  const range = { from: new Date(Date.now() - 2 * 86_400_000), to: new Date(Date.now() + 3600_000) };

  beforeAll(async () => {
    const [open] = await q<{ id: string }>(sql`select id from crm_stages where kind = 'open' order by position limit 1`);
    const [lost] = await q<{ id: string }>(sql`select id from crm_stages where kind = 'lost' order by position limit 1`);
    const [mgr] = await q<{ id: string }>(sql`insert into users (email, password_hash, name, role) values (${tag + "m@t.kz"}, 'x', 'Менеджер', 'admin') returning id`);
    const [client] = await q<{ id: string }>(sql`insert into users (email, password_hash, name) values (${tag + "c@t.kz"}, 'x', 'Клиент') returning id`);
    const [writer] = await q<{ id: string }>(sql`insert into users (email, password_hash, name) values (${tag + "w@t.kz"}, 'x', 'Пишет книгу') returning id`);
    Object.assign(ids, { open: open.id, lost: lost.id, mgr: mgr.id, client: client.id, writer: writer.id });
    const [book] = await q<{ id: string }>(sql`insert into books (user_id, theme, title, author_name, recipient_name) values (${client.id}, 'love', 'Т', 'А', 'Б') returning id`);
    const [draft] = await q<{ id: string }>(sql`insert into books (user_id, theme, title, author_name, recipient_name) values (${writer.id}, 'mom', 'Т', 'А', 'Б') returning id`);
    ids.book = book.id;
    // Книга «пишущего» клиента почти готова: 26 ответов из 30.
    await q(sql`
      insert into book_questions (book_id, position, chapter, prompt, title, answer)
      select ${draft.id}, g, 'ch', 'вопрос', 'вопрос', case when g <= 26 then 'ответ' else '' end from generate_series(1, 30) g`);

    const deal = async (key: string, o: { stage?: string; amount: number; source?: string; plan?: string | null; clientId?: string | null }) => {
      const [d] = await q<{ id: string }>(sql`
        insert into crm_deals (title, stage_id, amount, source, agreed_plan, client_id, assignee_id, contact_name)
        values (${tag + key}, ${o.stage ?? open.id}, ${o.amount}, ${o.source ?? "manual"}, ${o.plan ?? null}, ${o.clientId ?? null}, ${mgr.id}, ${"К " + key}) returning id`);
      ids[key] = d.id;
    };
    const pay = async (key: string, deal: string, amount: number, extra: { kind?: string; method?: string; ref?: string } = {}) => {
      const [p] = await q<{ id: string }>(sql`
        insert into crm_payments (deal_id, amount, kind, method, external_ref, paid_at, created_by_id)
        values (${ids[deal]}, ${amount}, ${extra.kind ?? "payment"}, ${extra.method ?? "manual"}, ${extra.ref ?? null}, ${hourAgo.toISOString()}::timestamptz, ${extra.method && extra.method !== "manual" ? null : mgr.id}) returning id`);
      ids[key] = p.id;
    };
    const order = async (key: string, o: { amount: number; prepaid?: number; status: string; paid?: boolean; postpay?: boolean; provider?: string; paymentId?: string | null }) => {
      const [r] = await q<{ id: string }>(sql`
        insert into orders (user_id, book_id, plan, items_amount, prepaid_amount, amount, currency, status, payment_provider, payment_id, contact_name, contact_phone, contact_email, paid_at, postpay)
        values (${client.id}, ${book.id}, 'print', ${o.amount + (o.prepaid ?? 0)}, ${o.prepaid ?? 0}, ${o.amount}, 'KZT', ${o.status}, ${o.provider ?? "manual"}, ${o.paymentId ?? null},
          ${tag + key}, '7', 'a@b.kz', ${o.paid ? sql`${hourAgo.toISOString()}::timestamptz` : sql`null`}, ${o.postpay ?? false}) returning id`);
      ids[key] = r.id;
    };
    const journal = (orderKey: string, amount: number, method = "manual", ref: string | null = null) =>
      q(sql`insert into order_payments (order_id, amount, method, external_ref, paid_at, receipt_storage_key, receipt_file_name, receipt_mime, receipt_size, created_by_id)
        values (${ids[orderKey]}, ${amount}, ${method}, ${ref}, ${hourAgo.toISOString()}::timestamptz, ${method === "manual" ? "orders/x/receipt.pdf" : null}, ${method === "manual" ? "чек.pdf" : null}, ${method === "manual" ? "application/pdf" : null}, ${method === "manual" ? 1 : null}, ${method === "manual" ? mgr.id : null})`);

    // A: договорённость 20 000, предоплата 10 000 по сделке; заказ на остаток 10 000 оплачен Kaspi (журнал).
    await deal("a", { amount: 20000, clientId: client.id });
    await pay("payA", "a", 10000, { kind: "prepayment" });
    await order("oA", { amount: 10000, prepaid: 10000, status: "paid", paid: true });
    await journal("oA", 10000, "kaspi", tag + "kA");
    await q(sql`update crm_deals set order_id = ${ids.oA} where id = ${ids.a}`);
    // Старые заказы: оплачен без журнала (по карте) и частично записанный (4 000 из 9 000).
    await order("oOld", { amount: 15000, status: "delivered", paid: true, provider: "cloudpayments", paymentId: "777123" });
    await order("oPart", { amount: 9000, status: "paid", paid: true });
    await journal("oPart", 4000);
    // Отменённый заказ, деньги получены: в «пришло» не идут, в «нужен возврат» — да.
    await order("oCancel", { amount: 7000, status: "cancelled", paid: true });
    await journal("oCancel", 7000, "kaspi", tag + "kC");
    // Ждут оплаты и постоплата.
    await order("oWait", { amount: 8000, status: "pending_payment" });
    await order("oPost", { amount: 6000, status: "delivered", postpay: true });
    await journal("oPost", 1000);
    // Сертификат, оплаченный Kaspi.
    const [gift] = await q<{ id: string }>(sql`
      insert into gift_cards (token, plan, amount, currency, status, payment_provider, payment_id, paid_at, buyer_name, buyer_email, recipient_name)
      values (${tag + "g"}, 'print', 12000, 'KZT', 'paid', 'manual', ${"kaspi:" + tag}, ${hourAgo.toISOString()}::timestamptz, ${tag + "buyer"}, 'g@b.kz', 'Р') returning id`);
    ids.gift = gift.id;

    // B: книга почти готова, оплачено 5 000 из 30 000, открыт счёт из чата на 25 000.
    await deal("b", { amount: 30000, clientId: writer.id });
    await pay("payB", "b", 5000, { kind: "prepayment" });
    const [inv] = await q<{ id: string }>(sql`
      insert into deal_invoices (token, deal_id, plan, agreed_total, amount, purpose, expires_at)
      values (${tag + "inv"}, ${ids.b}, 'print', 30000, 25000, 'remainder', now() + interval '7 days') returning id`);
    ids.inv = inv.id;
    // C: договорённость из чата (тариф указан), денег нет, клиент не заведён.
    await deal("c", { amount: 18000, source: "whatsapp", plan: "print" });
    // D: в отказе с деньгами. E: оплачено больше договорённости. F: онлайн-платёж по счёту (не проверяется).
    await deal("d", { amount: 10000, stage: lost.id });
    await pay("payD", "d", 3000);
    await deal("e", { amount: 10000 });
    await pay("payE", "e", 12000);
    await deal("f", { amount: 4000, source: "whatsapp", plan: "print" });
    await pay("payF", "f", 4000, { method: "kaspi", ref: tag + "ok" });
    // Лид с сайта с суммой — не договорённость.
    await deal("lead", { amount: 50000, source: "site" });
    // Оплаты Kaspi: одна записана в сделку (по операции), другая — нет (счёт закрыт, по сделке заказ).
    for (const [ext, target] of [
      [tag + "ok", ids.inv],
      [tag + "orphan", ids.inv],
    ])
      await q(sql`insert into payment_invoices (provider, target_kind, target_id, method, external_id, amount, status, paid_at) values ('kaspi', 'deal_invoice', ${target}, 'invoice', ${ext}, 25000, 'paid', now())`);
    // Kaspi принял другую сумму — платёж не засчитан, деньги вернуть; просто неоплаченный счёт — не деньги.
    await q(sql`insert into payment_invoices (provider, target_kind, target_id, method, external_id, amount, status, provider_status) values ('kaspi', 'deal_invoice', ${ids.inv}, 'qr', ${tag + "mismatch"}, 25000, 'failed', 'AmountMismatch:24000')`);
    await q(sql`insert into payment_invoices (provider, target_kind, target_id, method, external_id, amount, status, provider_status) values ('kaspi', 'deal_invoice', ${ids.inv}, 'qr', ${tag + "failed"}, 25000, 'failed', 'Error')`);
  });

  afterAll(async () => {
    await q(sql`delete from payment_invoices where external_id like ${tag + "%"}`);
    await q(sql`delete from deal_invoices where token like ${tag + "%"}`);
    await q(sql`delete from order_payments where order_id in (select id from orders where contact_name like ${tag + "%"})`);
    await q(sql`delete from crm_deals where title like ${tag + "%"}`);
    await q(sql`delete from orders where contact_name like ${tag + "%"}`);
    await q(sql`delete from gift_cards where token like ${tag + "%"}`);
    await q(sql`delete from books where user_id in (select id from users where email like ${tag + "%"})`);
    await q(sql`delete from users where email like ${tag + "%"}`);
    await pool.end();
  });

  const mine = <T extends { dealId?: string | null; orderId?: string | null; id: string }>(rows: T[]) =>
    rows.filter((r) => Object.values(ids).includes(r.id) || (r.dealId && Object.values(ids).includes(r.dealId)) || (r.orderId && Object.values(ids).includes(r.orderId)));

  it("деньги один раз: предоплата сделки + оплата заказа с вычтенной предоплатой = договорённость; старый заказ — суммой к оплате", async () => {
    const money = mine(await financeMoney(range.from, range.to));
    const of = (key: string) => money.filter((m) => m.id === ids[key] || m.orderId === ids[key]);
    // Сделка A: 10 000 предоплаты + 10 000 оплаты заказа (журнал) — без строки «заказ без записи».
    expect(money.filter((m) => m.dealId === ids.a).map((m) => [m.kind, m.method, m.amount]).sort()).toEqual([["order", "kaspi", 10000], ["prepayment", "manual", 10000]].sort());
    expect(money.filter((m) => m.dealId === ids.a).reduce((s, m) => s + m.amount, 0)).toBe(20000);
    // Оплачен до журнала: вся сумма к оплате на дату оплаты, способ — по операции (карта).
    expect(of("oOld").map((m) => [m.kind, m.method, m.amount])).toEqual([["legacy", "card", 15000]]);
    // Частично записан: 4 000 по чеку + 5 000 без записи.
    expect(of("oPart").map((m) => [m.kind, m.amount]).sort()).toEqual([["legacy", 5000], ["order", 4000]].sort());
    // Отменённый заказ и ждущий оплаты — не деньги; постоплата — только записанное.
    expect(of("oCancel")).toEqual([]);
    expect(of("oWait")).toEqual([]);
    expect(of("oPost").map((m) => m.amount)).toEqual([1000]);
    expect(money.filter((m) => m.id === ids.gift).map((m) => [m.source, m.method, m.amount])).toEqual([["gift", "kaspi", 12000]]);
    // Чек: у платежа сделки — запись чека (её нет), у оплаты заказа — сама запись журнала.
    expect(of("oPart").find((m) => m.kind === "order")?.receiptId).toBeTruthy();
    expect(money.find((m) => m.id === ids.payA)?.managerId).toBe(ids.mgr);
  });

  it("ожидается: остаток договорённости по готовности книги, заказ на оплате, постоплата; счёт из чата не прибавляется", async () => {
    const [deals, orders, unrecorded] = await Promise.all([financeDeals(), financeOrders(), financeUnrecorded()]);
    const period = financePeriod({ preset: "today", now: new Date(), tz: "Asia/Almaty" });
    const s = financeScreen({
      period,
      money: [],
      deals: deals.filter((d) => Object.values(ids).includes(d.id)),
      orders: orders.filter((o) => Object.values(ids).includes(o.id)),
      unrecorded: unrecorded.filter((u) => u.dealId && Object.values(ids).includes(u.dealId)),
      review: [],
      staff: [{ id: ids.mgr, name: "Менеджер", email: "m@t.kz" }],
      tz: "Asia/Almaty",
      now: new Date(),
    });
    const left = Object.fromEntries(s.expected.rows.map((r) => [r.ref, [r.left, r.group]]));
    const n = (key: string) => deals.find((d) => d.id === ids[key])?.number;
    const on = (key: string) => orders.find((o) => o.id === ids[key])?.number;
    expect(left).toEqual({
      [`Сделка №${n("b")}`]: [25000, "ready"],
      [`Сделка №${n("c")}`]: [18000, "none"],
      [`Заказ №${on("oWait")}`]: [8000, "ready"],
      [`Заказ №${on("oPost")}`]: [5000, "ready"],
    });
    expect(s.expected.rows.find((r) => r.ref === `Сделка №${n("b")}`)?.invoice).toMatch(/^счёт P\d+ · 25/);
    expect(s.expected.invoices).toEqual({ count: 1, sum: 25000 });
    expect(s.totals).toMatchObject({ expected: 25000 + 18000 + 8000, expectedReady: 25000 + 8000, postpay: 5000, expectedAll: 56000 });
    // Переплаты: E (+2 000), D в отказе (3 000), отменённый заказ (7 000), Kaspi вне учёта (25 000) и с чужой суммой (24 000).
    expect(s.issues.map((i) => [i.kind, i.amount]).sort()).toEqual(
      [
        ["deal_overpaid", 2000],
        ["deal_lost", 3000],
        ["order_cancelled", 7000],
        ["unrecorded", 25000],
        ["unrecorded", 24000],
      ].sort(),
    );
    expect(unrecorded.filter((u) => u.dealId === ids.b).map((u) => [u.externalId, u.mismatch, u.amount]).sort()).toEqual(
      [
        [tag + "orphan", false, 25000],
        [tag + "mismatch", true, 24000],
      ].sort(),
    );
    // Лид с сайта с суммой и сделка A (с заказом, предоплата учтена) — не ожидание и не переплата.
    expect(deals.some((d) => d.id === ids.lead)).toBe(false);
    expect(deals.some((d) => d.id === ids.a)).toBe(false);
  });

  it("«Проверить»: ручные платежи сделок и оплаты заказов без проверки; онлайн не проверяется; «Проверено» — один раз", async () => {
    const review = await financeReview();
    const listed = (id: string) => review.some((r) => r.id === id);
    expect(listed(ids.payA) && listed(ids.payE)).toBe(true);
    expect(listed(ids.payF)).toBe(false);
    const [partPay] = await q<{ id: string }>(sql`select id from order_payments where order_id = ${ids.oPart}`);
    expect(review.find((r) => r.id === partPay.id)).toMatchObject({ kind: "order", amount: 4000, receiptId: partPay.id });
    const payments = new DealPayments();
    expect(await payments.review(ids.payF, ids.mgr)).toBeNull();
    expect(await payments.review(ids.payA, ids.mgr)).toMatchObject({ id: ids.payA, reviewedById: ids.mgr });
    expect(await payments.review(ids.payA, ids.mgr)).toBeNull();
    expect((await financeReview()).some((r) => r.id === ids.payA)).toBe(false);
    expect((await financeMoney(range.from, range.to)).find((m) => m.id === ids.payA)?.reviewedAt).toBeInstanceOf(Date);
  });
});
