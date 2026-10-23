import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@/shared/infrastructure/db";
import { drizzleClients, orderOrigin } from "@/modules/sales/infrastructure/adapters";

/**
 * Повторный клиент и источник по промокоду (deals-24) на PostgreSQL: покупки клиента — выигранные сделки и оплаченные
 * заказы без своей выигранной сделки (покупка из чата с заказом — одна); код сертификата — «Сертификат», код-приглашение
 * клиента — «Рекомендация».
 * Запуск: INTEGRATION=1 npx vitest run tests/deal-repeat.integration.test.ts (база из DATABASE_URL с миграциями).
 */
const run = process.env.INTEGRATION === "1" ? describe : describe.skip;
const tag = `drep${Date.now()}`;

run("sales: повторный клиент и источник по промокоду (PostgreSQL)", () => {
  const q = async <T extends Record<string, unknown>>(query: ReturnType<typeof sql>) => (await db.execute<T>(query)).rows;
  const one = async (query: ReturnType<typeof sql>) => (await q<{ id: string }>(query))[0].id;
  const ids: Record<string, string> = {};
  const order = async (userId: string, o: { status?: string; paid?: boolean; promo?: string | null } = {}) => {
    const book = await one(sql`insert into books (user_id, theme) values (${userId}, 'mom') returning id`);
    return one(sql`
      insert into orders (user_id, book_id, plan, items_amount, amount, currency, payment_provider, contact_name, contact_email, contact_phone, status, paid_at, promo_code)
      values (${userId}, ${book}, 'hardcover', 20000, 20000, 'KZT', 'cloudpayments', ${tag}, ${`${tag}@test.kz`}, '77010000000', ${o.status ?? "paid"}, ${o.paid === false ? null : sql`now()`}, ${o.promo ?? null})
      returning id`);
  };

  beforeAll(async () => {
    ids.client = await one(sql`insert into users (email, password_hash, name) values (${`${tag}@test.kz`}, 'x', ${tag}) returning id`);
    ids.friend = await one(sql`insert into users (email, password_hash, name) values (${`${tag}-f@test.kz`}, 'x', ${tag}) returning id`);
    ids.won = await one(sql`select id from crm_stages where kind = 'won' order by position limit 1`);
    ids.open = await one(sql`select id from crm_stages where kind = 'open' order by position limit 1`);
  });

  afterAll(async () => {
    await q(sql`delete from crm_deals where title = ${tag}`);
    await q(sql`delete from orders where contact_name = ${tag}`);
    await q(sql`delete from gift_cards where buyer_name = ${tag}`);
    await q(sql`delete from promo_codes where note = ${tag}`);
    await q(sql`delete from books where user_id in (${ids.client}, ${ids.friend})`);
    await q(sql`delete from users where email like ${tag + "%"}`);
    await pool.end();
  });

  it("покупки: выигранная сделка, оплаченный заказ без сделки; заказ выигранной сделки, отменённый и неоплаченный — не в счёт", async () => {
    expect(await drizzleClients.purchases(ids.client)).toBe(0);
    const withDeal = await order(ids.client);
    await q(sql`insert into crm_deals (title, stage_id, client_id, order_id) values (${tag}, ${ids.won}, ${ids.client}, ${withDeal})`);
    expect(await drizzleClients.purchases(ids.client)).toBe(1);
    await order(ids.client);
    await order(ids.client, { status: "cancelled" });
    await order(ids.client, { status: "pending_payment", paid: false });
    await q(sql`insert into crm_deals (title, stage_id, client_id) values (${tag}, ${ids.open}, ${ids.client})`);
    expect(await drizzleClients.purchases(ids.client)).toBe(2);
  });

  it("источник по промокоду: сертификат, приглашение, обычный код и без кода", async () => {
    const giftCode = `${tag}G`.toUpperCase();
    const inviteCode = `${tag}I`.toUpperCase();
    const plainCode = `${tag}P`.toUpperCase();
    const giftPromo = await one(sql`insert into promo_codes (code, kind, value, note) values (${giftCode}, 'fixed', 20000, ${tag}) returning id`);
    await q(sql`insert into promo_codes (code, kind, value, note, owner_user_id) values (${inviteCode}, 'percent', 10, ${tag}, ${ids.friend})`);
    await q(sql`insert into promo_codes (code, kind, value, note) values (${plainCode}, 'percent', 10, ${tag})`);
    await q(sql`
      insert into gift_cards (token, plan, amount, currency, status, payment_provider, buyer_name, buyer_email, recipient_name, promo_code_id)
      values (${tag}, 'print', 20000, 'KZT', 'paid', 'manual', ${tag}, 'g@b.kz', 'Р', ${giftPromo})`);
    expect(await orderOrigin(await order(ids.client, { promo: giftCode.toLowerCase() }))).toBe("gift");
    expect(await orderOrigin(await order(ids.client, { promo: inviteCode }))).toBe("referral");
    expect(await orderOrigin(await order(ids.client, { promo: plainCode }))).toBeNull();
    expect(await orderOrigin(await order(ids.client))).toBeNull();
  });
});
