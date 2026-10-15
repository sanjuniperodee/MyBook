import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "@/shared/infrastructure/db";
import { DealPayments } from "@/modules/sales/infrastructure/payments";
import { DrizzleDealRepository } from "@/modules/sales/infrastructure/persistence";
import { DrizzlePromoCodeRepository } from "@/modules/ordering/infrastructure/persistence/DrizzlePromoCodeRepository";
import { getSettings, saveSettings } from "@/modules/workspace";

/**
 * F4 на настоящем PostgreSQL: блокировка сделки в платежах (B6), атомарное сохранение настроек (B7), выборки
 * одним запросом (findByIds, findByCodes). Запуск: INTEGRATION=1 npx vitest run tests/payments-settings.integration.test.ts
 * (база из DATABASE_URL с применёнными миграциями).
 */
const run = process.env.INTEGRATION === "1" ? describe : describe.skip;
const tag = `f4${Date.now()}`;

run("F4: платежи, настройки, выборки (PostgreSQL)", () => {
  const ids: Record<string, string> = {};
  const q = async <T extends Record<string, unknown>>(query: ReturnType<typeof sql>) => (await db.execute<T>(query)).rows;
  const payments = new DealPayments();
  let savedSettings: { key: string; value: string; updated_by_id: string | null }[] = [];

  beforeAll(async () => {
    const [open] = await q<{ id: string }>(sql`select id from crm_stages where kind = 'open' order by position limit 1`);
    const [mgr] = await q<{ id: string }>(sql`insert into users (email, password_hash, name, role) values (${tag + "m@t.kz"}, 'x', 'Менеджер', 'admin') returning id`);
    ids.mgr = mgr.id;
    for (const key of ["a", "b"]) {
      const [d] = await q<{ id: string }>(sql`insert into crm_deals (title, stage_id, amount, contact_name) values (${tag + key}, ${open.id}, 30000, 'К') returning id`);
      ids[key] = d.id;
    }
    savedSettings = await q(sql`select key, value, updated_by_id from crm_settings where key in ('crm.slaMinutes', 'crm.maxDiscount')`);
    await q(sql`delete from crm_settings where key in ('crm.slaMinutes', 'crm.maxDiscount')`);
    await q(sql`insert into promo_codes (code, kind, value) values (${tag.toUpperCase() + "-1"}, 'percent', 10), (${tag.toUpperCase() + "-2"}, 'fixed', 500)`);
  });

  afterAll(async () => {
    await q(sql`delete from crm_deals where title like ${tag + "%"}`);
    await q(sql`delete from promo_codes where code like ${tag.toUpperCase() + "%"}`);
    await q(sql`delete from crm_settings where key in ('crm.slaMinutes', 'crm.maxDiscount')`);
    for (const r of savedSettings) await q(sql`insert into crm_settings (key, value, updated_by_id) values (${r.key}, ${r.value}, ${r.updated_by_id})`);
    await q(sql`delete from users where email like ${tag + "%"}`);
    await pool.end();
  });

  it("B6: одновременные первые платежи — ровно одна «предоплата»", async () => {
    const pay = () => payments.add({ dealId: ids.a, clientId: null, amount: 1000, createdById: ids.mgr });
    const rows = await Promise.all([pay(), pay(), pay(), pay()]);
    expect(rows.map((r) => r.kind).sort()).toEqual(["payment", "payment", "payment", "prepayment"]);
  });

  it("B6: одновременные возвраты не превышают принятое", async () => {
    await payments.add({ dealId: ids.b, clientId: null, amount: 5000, createdById: ids.mgr });
    const refund = () => payments.refund({ dealId: ids.b, clientId: null, amount: 3000, note: "отказ", createdById: ids.mgr }).then(() => "ok", (e: Error & { code?: string }) => e.code ?? e.message);
    expect((await Promise.all([refund(), refund()])).sort()).toEqual(["ok", "refundTooBig"]);
    expect(await payments.paidTotal(ids.b)).toBe(2000);
  });

  it("B7: ошибка при сохранении — ни удаления, ни записи (одна транзакция)", async () => {
    await saveSettings({ "crm.slaMinutes": "15" }, ids.mgr);
    // Несуществующий сотрудник — нарушение внешнего ключа на вставке после удаления.
    await expect(saveSettings({ "crm.slaMinutes": "", "crm.maxDiscount": "20" }, randomUUID())).rejects.toThrow();
    const rows = await q<{ key: string; value: string }>(sql`select key, value from crm_settings where key in ('crm.slaMinutes', 'crm.maxDiscount') order by key`);
    expect(rows).toEqual([{ key: "crm.slaMinutes", value: "15" }]);
    await saveSettings({ "crm.slaMinutes": "", "crm.maxDiscount": "20" }, ids.mgr);
    expect(await getSettings(["crm.maxDiscount"])).toEqual({ "crm.maxDiscount": "20" });
  });

  it("findByIds и findByCodes — одним запросом, ненайденных нет", async () => {
    const deals = await new DrizzleDealRepository().findByIds([ids.b, randomUUID(), "мусор", ids.a]);
    expect(deals.map((d) => d.id).sort()).toEqual([ids.a, ids.b].sort());
    const codes = await new DrizzlePromoCodeRepository().findByCodes([`${tag}-1`, `${tag}-2`, "НЕТ-ТАКОГО", ""]);
    expect(codes.map((c) => c.code).sort()).toEqual([`${tag.toUpperCase()}-1`, `${tag.toUpperCase()}-2`]);
  });
});
