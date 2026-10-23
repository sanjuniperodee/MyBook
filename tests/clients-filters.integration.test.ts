import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@/shared/infrastructure/db";
import { queryClients } from "@/modules/reporting/infrastructure/Clients";

/**
 * Фильтры клиентов для ручной добивки (contacts-13) на PostgreSQL: повод книги или сделки из чата, месяц повода, период
 * покупок, «без открытой сделки».
 * Запуск: INTEGRATION=1 npx vitest run tests/clients-filters.integration.test.ts (база из DATABASE_URL с миграциями).
 */
const run = process.env.INTEGRATION === "1" ? describe : describe.skip;
const tag = `cf${Date.now()}`;

run("reporting: фильтры клиентов (PostgreSQL)", () => {
  const q = async <T extends Record<string, unknown>>(query: ReturnType<typeof sql>) => (await db.execute<T>(query)).rows;
  const one = async (query: ReturnType<typeof sql>) => (await q<{ id: string }>(query))[0].id;
  const ids: Record<string, string> = {};
  const names = async (filters: Parameters<typeof queryClients>[0]["filters"]) =>
    (await queryClients({ segment: "all", q: tag, limit: 50, offset: 0, filters })).rows.map((r) => r.user.name.replace(`${tag}-`, "")).sort();

  beforeAll(async () => {
    const user = (key: string) => one(sql`insert into users (email, password_hash, name) values (${`${tag}-${key}@test.kz`}, 'x', ${`${tag}-${key}`}) returning id`);
    for (const k of ["site", "chat", "busy", "none"]) ids[k] = await user(k);
    const won = await one(sql`select id from crm_stages where kind = 'won' order by position limit 1`);
    const open = await one(sql`select id from crm_stages where kind = 'open' order by position limit 1`);
    // Сайт: книга к 14 февраля, заказ оплачен в январе 2026.
    const book = await one(sql`insert into books (user_id, theme, occasion) values (${ids.site}, 'love', 'valentine') returning id`);
    await q(sql`
      insert into orders (user_id, book_id, plan, items_amount, amount, currency, payment_provider, contact_name, contact_email, contact_phone, status, paid_at)
      values (${ids.site}, ${book}, 'hardcover', 20000, 20000, 'KZT', 'cloudpayments', ${tag}, ${`${tag}@test.kz`}, '77010000000', 'delivered', '2026-01-15T10:00:00Z')`);
    // Чат: выигранная сделка «8 марта» с датой события и платежом в марте.
    const deal = await one(sql`insert into crm_deals (title, stage_id, client_id, custom_fields, closed_at) values (${tag}, ${won}, ${ids.chat}, ${JSON.stringify({ occasion: "8 марта", event_date: "2026-03-08" })}::jsonb, '2026-03-01T10:00:00Z') returning id`);
    await q(sql`insert into crm_payments (deal_id, amount, kind, paid_at) values (${deal}, 25000, 'payment', '2026-03-01T10:00:00Z')`);
    // Занят: книга ко дню рождения в мае и открытая сделка.
    await q(sql`insert into books (user_id, theme, occasion, occasion_date) values (${ids.busy}, 'mom', 'birthday', '2026-05-20')`);
    await q(sql`insert into crm_deals (title, stage_id, client_id) values (${tag}, ${open}, ${ids.busy})`);
  });

  afterAll(async () => {
    await q(sql`delete from crm_payments where deal_id in (select id from crm_deals where title = ${tag})`);
    await q(sql`delete from crm_deals where title = ${tag}`);
    await q(sql`delete from orders where contact_name = ${tag}`);
    await q(sql`delete from books where user_id in (select id from users where email like ${tag + "%"})`);
    await q(sql`delete from users where email like ${tag + "%"}`);
    await pool.end();
  });

  it("повод — из книги и из сделки из чата", async () => {
    expect(await names({ occasion: "valentine" })).toEqual(["site"]);
    expect(await names({ occasion: "march8" })).toEqual(["chat"]);
  });

  it("месяц повода: дата книги или события; праздник с постоянной датой — его месяц", async () => {
    expect(await names({ month: 2 })).toEqual(["site"]);
    expect(await names({ month: 3 })).toEqual(["chat"]);
    expect(await names({ month: 5 })).toEqual(["busy"]);
  });

  it("покупали в период и без открытой сделки", async () => {
    expect(await names({ boughtFrom: "2026-01", boughtTo: "2026-02" })).toEqual(["site"]);
    expect(await names({ boughtFrom: "2026-01", boughtTo: "2026-03" })).toEqual(["chat", "site"]);
    expect(await names({ noOpenDeal: true })).toEqual(["chat", "none", "site"]);
  });
});
