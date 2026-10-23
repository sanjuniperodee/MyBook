import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@/shared/infrastructure/db";
import { orderCrm, productionBoard } from "@/modules/reporting/infrastructure/Orders";
import { bookList } from "@/modules/reporting/infrastructure/Books";

/**
 * Заказ ↔ сделка (deals-14) на PostgreSQL: номер сделки на доске производства, блок сделки в заказе (ответственный, чат),
 * сделка в списке книг — сделка заказа, иначе последняя сделка клиента.
 * Запуск: INTEGRATION=1 npx vitest run tests/order-deal.integration.test.ts (база из DATABASE_URL с миграциями).
 */
const run = process.env.INTEGRATION === "1" ? describe : describe.skip;
const tag = `odl${Date.now()}`;

run("reporting: заказ и его сделка (PostgreSQL)", () => {
  const q = async <T extends Record<string, unknown>>(query: ReturnType<typeof sql>) => (await db.execute<T>(query)).rows;
  const one = async (query: ReturnType<typeof sql>) => (await q<{ id: string }>(query))[0].id;
  const all = { userId: "00000000-0000-4000-8000-000000000000", seesAll: true };
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    ids.client = await one(sql`insert into users (email, password_hash, name) values (${`${tag}@test.kz`}, 'x', ${tag}) returning id`);
    ids.book = await one(sql`insert into books (user_id, theme, title) values (${ids.client}, 'mom', ${tag}) returning id`);
    ids.other = await one(sql`insert into books (user_id, theme, title) values (${ids.client}, 'love', ${tag}) returning id`);
    ids.order = await one(sql`
      insert into orders (user_id, book_id, plan, items_amount, amount, currency, payment_provider, contact_name, contact_email, contact_phone, status, paid_at)
      values (${ids.client}, ${ids.book}, 'hardcover', 20000, 20000, 'KZT', 'cloudpayments', ${tag}, ${`${tag}@test.kz`}, '77010000000', 'paid', now()) returning id`);
    const won = await one(sql`select id from crm_stages where kind = 'won' order by position limit 1`);
    const open = await one(sql`select id from crm_stages where kind = 'open' order by position limit 1`);
    ids.deal = await one(sql`insert into crm_deals (title, stage_id, client_id, order_id) values (${tag}, ${won}, ${ids.client}, ${ids.order}) returning id`);
    ids.openDeal = await one(sql`insert into crm_deals (title, stage_id, client_id) values (${tag}, ${open}, ${ids.client}) returning id`);
    ids.conv = await one(sql`insert into crm_conversations (channel, channel_id, chat_id, deal_id, last_message_at) values ('whatsapp', ${tag}, ${tag}, ${ids.deal}, now()) returning id`);
  });

  afterAll(async () => {
    await q(sql`delete from crm_conversations where channel_id = ${tag}`);
    await q(sql`delete from crm_deals where title = ${tag}`);
    await q(sql`delete from orders where contact_name = ${tag}`);
    await q(sql`delete from books where title = ${tag}`);
    await q(sql`delete from users where email = ${tag + "@test.kz"}`);
    await pool.end();
  });

  it("доска производства и карточка заказа знают сделку заказа и её чат", async () => {
    const number = (await q<{ number: number }>(sql`select number from crm_deals where id = ${ids.deal}`))[0].number;
    expect((await productionBoard(new Date(0), all)).find((o) => o.id === ids.order)?.dealNumber).toBe(number);
    expect((await orderCrm({ id: ids.order, userId: ids.client })).deal).toMatchObject({ id: ids.deal, number, conversationId: ids.conv });
  });

  it("в списке книг — сделка заказа книги, у книги без заказа — открытая сделка клиента", async () => {
    const rows = await bookList("all" as never, { staleDays: 14, now: Date.now(), viewer: all, q: tag });
    expect(rows.find((r) => r.book.id === ids.book)?.deal?.id).toBe(ids.deal);
    expect(rows.find((r) => r.book.id === ids.other)?.deal?.id).toBe(ids.openDeal);
  });
});
