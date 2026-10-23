import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@/shared/infrastructure/db";
import { search } from "@/modules/reporting/infrastructure/Search";
import { queryClients } from "@/modules/reporting/infrastructure/Clients";
import { dealList } from "@/modules/reporting/infrastructure/Deals";

/**
 * Поиск по телефону, доп. телефонам, тегам и e-mail (contacts-d1, contacts-6, deals-3) на PostgreSQL: «8 701 123 45 67»
 * находит «+7 701…» и «77011234567», доп. номер клиента и сделки, тег по части слова.
 * Запуск: INTEGRATION=1 npx vitest run tests/phone-search.integration.test.ts (база из DATABASE_URL с миграциями).
 */
const run = process.env.INTEGRATION === "1" ? describe : describe.skip;
const tag = `phs${Date.now()}`;
const tail = String(Date.now()).slice(-7);

run("reporting: поиск по телефону и тегам (PostgreSQL)", () => {
  const q = async <T extends Record<string, unknown>>(query: ReturnType<typeof sql>) => (await db.execute<T>(query)).rows;
  const one = async (query: ReturnType<typeof sql>) => (await q<{ id: string }>(query))[0].id;
  const all = { userId: "00000000-0000-4000-8000-000000000000", seesAll: true };
  const ids: Record<string, string> = {};
  let pipeline = "";

  beforeAll(async () => {
    ids.client = await one(sql`insert into users (email, password_hash, name, phone, extra_phones, tags) values (${`${tag}@test.kz`}, 'x', ${tag}, ${`+7 (701) ${tail.slice(0, 3)}-${tail.slice(3, 5)}-${tail.slice(5)}`}, ${`{"7702${tail}"}`}, ${`{"vip-${tag}"}`}) returning id`);
    const [stage] = await q<{ id: string; pipeline_id: string }>(sql`select id, pipeline_id from crm_stages where kind = 'open' order by position limit 1`);
    pipeline = stage.pipeline_id;
    ids.deal = await one(sql`insert into crm_deals (title, stage_id, contact_name, contact_phone, contact_email, extra_phones, tags) values (${tag}, ${stage.id}, 'К', ${`7701${tail}`}, ${`buyer-${tag}@mail.kz`}, ${`{"7705${tail}"}`}, ${`{"сертификат-${tag}"}`}) returning id`);
  });

  afterAll(async () => {
    await q(sql`delete from crm_deals where title = ${tag}`);
    await q(sql`delete from users where email = ${tag + "@test.kz"}`);
    await pool.end();
  });

  const sections = { orders: false, clients: true, deals: true, chats: false };
  it("номер с 8 и пробелами находит клиента и сделку, записанные по-разному", async () => {
    const r = await search(`8 701 ${tail.slice(0, 3)} ${tail.slice(3, 5)} ${tail.slice(5)}`, all, sections);
    expect(r.clientRows.some((u) => u.id === ids.client)).toBe(true);
    expect(r.dealRows.some((d) => d.deal.id === ids.deal)).toBe(true);
  });

  it("доп. телефоны и теги — в поиске, списке клиентов и сделок; e-mail — в списке сделок", async () => {
    expect((await search(`8702${tail}`, all, sections)).clientRows.some((u) => u.id === ids.client)).toBe(true);
    expect((await search(`+7 705 ${tail}`, all, sections)).dealRows.some((d) => d.deal.id === ids.deal)).toBe(true);
    expect((await queryClients({ segment: "all", q: `vip-${tag}`, limit: 10, offset: 0 })).rows.map((r) => r.user.id)).toContain(ids.client);
    expect((await queryClients({ segment: "all", q: `8702${tail}`, limit: 10, offset: 0 })).rows.map((r) => r.user.id)).toContain(ids.client);
    const deals = (q: string) => dealList(all, { id: pipeline }, { q }, [], "list").then((rows) => rows.map((r) => r.deal.id));
    expect(await deals(`сертификат-${tag}`)).toContain(ids.deal);
    expect(await deals(`buyer-${tag}`)).toContain(ids.deal);
    expect(await deals(`8705${tail}`)).toContain(ids.deal);
  });
});
