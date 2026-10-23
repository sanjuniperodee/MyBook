import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@/shared/infrastructure/db";
import { vcardClients } from "@/modules/reporting/infrastructure/Vcard";
import { queryClients } from "@/modules/reporting/infrastructure/Clients";

/**
 * Клиенты для vCard и повод в CSV (contacts-10) на PostgreSQL: только с телефоном, номер последней сделки, повод сделки
 * или книги; since — изменённые; «только свои».
 * Запуск: INTEGRATION=1 npx vitest run tests/vcard.integration.test.ts (база из DATABASE_URL с миграциями).
 */
const run = process.env.INTEGRATION === "1" ? describe : describe.skip;
const tag = `vca${Date.now()}`;

run("reporting: контакты для телефона магазина (PostgreSQL)", () => {
  const q = async <T extends Record<string, unknown>>(query: ReturnType<typeof sql>) => (await db.execute<T>(query)).rows;
  const one = async (query: ReturnType<typeof sql>) => (await q<{ id: string }>(query))[0].id;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const user = (key: string, phone: string | null, updated = "now()") =>
      one(sql`insert into users (email, password_hash, name, phone, updated_at) values (${`${tag}-${key}@t.kz`}, 'x', ${`${tag}-${key}`}, ${phone}, ${sql.raw(updated)}) returning id`);
    ids.deal = await user("deal", "+7 701 000 11 22");
    ids.book = await user("book", "77010002233", "now() - interval '30 days'");
    ids.nophone = await user("nophone", null);
    const open = await one(sql`select id from crm_stages where kind = 'open' order by position limit 1`);
    await q(sql`insert into crm_deals (title, stage_id, client_id, custom_fields) values (${tag}, ${open}, ${ids.deal}, '{"occasion":"День рождения"}'::jsonb)`);
    await q(sql`insert into books (user_id, theme, occasion) values (${ids.book}, 'mom', 'valentine')`);
  });

  afterAll(async () => {
    await q(sql`delete from crm_deals where title = ${tag}`);
    await q(sql`delete from books where user_id = ${ids.book}`);
    await q(sql`delete from users where email like ${tag + "%"}`);
    await pool.end();
  });

  it("только с телефоном; повод сделки, иначе книги; since — изменённые", async () => {
    const all = (await vcardClients({ since: null, scopeManagerId: null })).filter((r) => r.name.startsWith(tag));
    expect(all.map((r) => r.name).sort()).toEqual([`${tag}-book`, `${tag}-deal`]);
    expect(all.find((r) => r.id === ids.deal)).toMatchObject({ occasion: "День рождения" });
    expect(all.find((r) => r.id === ids.deal)?.deal_number).toBeGreaterThan(0);
    expect(all.find((r) => r.id === ids.book)).toMatchObject({ occasion: "valentine", deal_number: null });
    const fresh = (await vcardClients({ since: new Date(Date.now() - 86_400_000), scopeManagerId: null })).filter((r) => r.name.startsWith(tag));
    expect(fresh.map((r) => r.id)).toEqual([ids.deal]);
  });

  it("повод — и в строках списка клиентов (CSV)", async () => {
    const rows = (await queryClients({ segment: "all", q: tag, limit: 10, offset: 0 })).rows;
    expect(rows.find((r) => r.user.id === ids.book)?.occasion).toBe("valentine");
  });
});
