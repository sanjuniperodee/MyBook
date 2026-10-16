import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@/shared/infrastructure/db";
import { DrizzleDealRepository } from "@/modules/sales/infrastructure/persistence";

/**
 * Деньги сделки не пропадают при слиянии и удалении (PostgreSQL): платежи и чеки ссылаются на сделку каскадом.
 * Запуск: INTEGRATION=1 npx vitest run tests/deal-money.integration.test.ts (база из DATABASE_URL).
 */
const run = process.env.INTEGRATION === "1" ? describe : describe.skip;
const tag = `dm${Date.now()}`;

run("sales: деньги при слиянии и удалении сделки (PostgreSQL)", () => {
  const ids: Record<string, string> = {};
  const q = async <T extends Record<string, unknown>>(query: ReturnType<typeof sql>) => (await db.execute<T>(query)).rows;
  const repo = new DrizzleDealRepository();

  beforeAll(async () => {
    const [open] = await q<{ id: string }>(sql`select id from crm_stages where kind = 'open' order by position limit 1`);
    for (const key of ["target", "source", "empty"]) {
      const [d] = await q<{ id: string }>(sql`insert into crm_deals (title, stage_id, amount, contact_name) values (${tag + key}, ${open.id}, 20000, 'К') returning id`);
      ids[key] = d.id;
    }
    const [p] = await q<{ id: string }>(sql`insert into crm_payments (deal_id, amount, kind) values (${ids.source}, 10000, 'prepayment') returning id`);
    await q(sql`insert into crm_receipts (deal_id, payment_id, storage_key, file_name, mime, size, amount) values (${ids.source}, ${p.id}, ${"receipts/" + ids.source + "/x.pdf"}, 'чек.pdf', 'application/pdf', 1, 10000)`);
  });
  afterAll(async () => {
    await q(sql`delete from crm_deals where title like ${tag + "%"}`);
    await pool.end();
  });

  it("hasMoney: есть платёж или чек — да, пустая сделка — нет", async () => {
    expect(await repo.hasMoney(ids.source)).toBe(true);
    expect(await repo.hasMoney(ids.empty)).toBe(false);
  });

  it("слияние переносит платежи и чеки в целевую сделку, а не удаляет их", async () => {
    const [target, source] = await Promise.all([repo.findById(ids.target), repo.findById(ids.source)]);
    await repo.mergeInto(target!, source!);
    expect(await q(sql`select amount from crm_payments where deal_id = ${ids.target}`)).toEqual([{ amount: 10000 }]);
    expect(await q(sql`select file_name from crm_receipts where deal_id = ${ids.target}`)).toEqual([{ file_name: "чек.pdf" }]);
    expect(await repo.findById(ids.source)).toBeNull();
    expect(await repo.hasMoney(ids.target)).toBe(true);
  });
});
