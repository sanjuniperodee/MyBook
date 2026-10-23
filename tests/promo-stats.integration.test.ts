import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@/shared/infrastructure/db";
import { DrizzleOrderingQueries } from "@/modules/ordering/infrastructure/persistence/DrizzleOrderingQueries";

/**
 * Отдача промокодов на экране «Промокоды» (analytics-d7) на PostgreSQL: заказ, отменённый после оплаты, не входит ни
 * в выручку, ни в число оплаченных; неоплаченный — тоже.
 * Запуск: INTEGRATION=1 npx vitest run tests/promo-stats.integration.test.ts (база из DATABASE_URL с миграциями).
 */
const run = process.env.INTEGRATION === "1" ? describe : describe.skip;
const tag = `pst${Date.now()}`;
const code = tag.toUpperCase();

run("ordering: статистика промокодов (PostgreSQL)", () => {
  const q = (query: ReturnType<typeof sql>) => db.execute(query);

  beforeAll(async () => {
    const [{ id: user }] = (await db.execute<{ id: string }>(sql`insert into users (email, password_hash, name) values (${`${tag}@test.kz`}, 'x', ${tag}) returning id`)).rows;
    await q(sql`insert into promo_codes (code, kind, value, note) values (${code}, 'percent', 10, ${tag})`);
    const order = async (amount: number, status: string, paid: boolean) => {
      const [{ id: book }] = (await db.execute<{ id: string }>(sql`insert into books (user_id, theme) values (${user}, 'love') returning id`)).rows;
      await q(sql`
        insert into orders (user_id, book_id, plan, items_amount, amount, currency, payment_provider, contact_name, contact_email, contact_phone, status, paid_at, promo_code)
        values (${user}, ${book}, 'hardcover', ${amount}, ${amount}, 'KZT', 'cloudpayments', ${tag}, ${`${tag}@test.kz`}, '77010000000', ${status}, ${paid ? sql`now()` : null}, ${code})`);
    };
    await order(18_000, "delivered", true);
    await order(27_000, "paid", true);
    await order(50_000, "cancelled", true);
    await order(9_000, "pending_payment", false);
  });

  afterAll(async () => {
    await q(sql`delete from orders where contact_name = ${tag}`);
    await q(sql`delete from promo_codes where code = ${code}`);
    await q(sql`delete from books where user_id in (select id from users where email like ${tag + "%"})`);
    await q(sql`delete from users where email like ${tag + "%"}`);
    await pool.end();
  });

  it("выручка и оплаченные — без отменённого после оплаты", async () => {
    const row = (await new DrizzleOrderingQueries().promoStats()).find((r) => r.promo.code === code);
    expect(row).toMatchObject({ revenue: 45_000, paid: 2 });
  });
});
