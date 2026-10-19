import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@/shared/infrastructure/db";
import { DrizzleDealRepository } from "@/modules/sales/infrastructure/persistence";
import { Deal, type Stage } from "@/modules/sales/domain";
import { automationStats } from "@/modules/reporting/infrastructure/Automations";

/**
 * Статистика повторных продаж по правилу (contacts-16) на PostgreSQL: сделка помнит правило, которое её создало;
 * «создано / выиграно / оплачено» за 90 дней.
 * Запуск: INTEGRATION=1 npx vitest run tests/automation-stats.integration.test.ts (база из DATABASE_URL с миграциями).
 */
const run = process.env.INTEGRATION === "1" ? describe : describe.skip;
const tag = `ast${Date.now()}`;

run("reporting: статистика правил автоматизаций (PostgreSQL)", () => {
  const q = async <T extends Record<string, unknown>>(query: ReturnType<typeof sql>) => (await db.execute<T>(query)).rows;
  const one = async (query: ReturnType<typeof sql>) => (await q<{ id: string }>(query))[0].id;
  const repo = new DrizzleDealRepository();
  const ids: Record<string, string> = {};

  /** Сделка через репозиторий продаж — как её создаёт правило. */
  const create = async (automationId: string | null) => {
    const { id, number } = await repo.nextIdentity();
    const stage: Stage = { id: ids.open, name: "Новая", kind: "open", pipelineId: ids.pipeline, position: 0, milestone: null };
    const deal = Deal.open(id, number, { title: tag, stageId: ids.open, source: "repeat", clientId: null, contactName: "К", contactPhone: null, contactEmail: null, amount: 0, assigneeId: null, createdById: null, orderId: null, unsorted: false, customFields: {}, utm: null, automationId }, stage, new Date());
    await repo.add(deal);
    return id;
  };

  beforeAll(async () => {
    ids.rule = await one(sql`insert into crm_automations (name, trigger, active) values (${tag}, 'occasion.holiday', false) returning id`);
    const [open] = await q<{ id: string; pipeline_id: string }>(sql`select id, pipeline_id from crm_stages where kind = 'open' order by position limit 1`);
    ids.open = open.id;
    ids.pipeline = open.pipeline_id;
    ids.won = await one(sql`select id from crm_stages where kind = 'won' order by position limit 1`);
  });

  afterAll(async () => {
    await q(sql`delete from crm_payments where deal_id in (select id from crm_deals where title = ${tag})`);
    await q(sql`delete from crm_deals where title = ${tag}`);
    await q(sql`delete from crm_automations where name = ${tag}`);
    await pool.end();
  });

  it("сделка правила — в «создано»; после выигрыша — в «выиграно» и в сумму; платёж по открытой — в сумму; старше 90 дней и без правила — нет", async () => {
    const a = await create(ids.rule);
    expect(await q(sql`select automation_id from crm_deals where id = ${a}`)).toEqual([{ automation_id: ids.rule }]);
    expect((await repo.findById(a))?.snapshot().automationId).toBe(ids.rule);
    await create(null);
    expect((await automationStats()).get(ids.rule)).toEqual({ created: 1, won: 0, amount: 0 });

    await q(sql`update crm_deals set stage_id = ${ids.won}, closed_at = now(), amount = 30000 where id = ${a}`);
    expect((await automationStats()).get(ids.rule)).toEqual({ created: 1, won: 1, amount: 30000 });

    const b = await create(ids.rule);
    await q(sql`insert into crm_payments (deal_id, amount, kind) values (${b}, 10000, 'prepayment')`);
    const old = await create(ids.rule);
    await q(sql`update crm_deals set created_at = now() - interval '100 days' where id = ${old}`);
    expect((await automationStats()).get(ids.rule)).toEqual({ created: 2, won: 1, amount: 40000 });

    // Правило удалили — сделки остаются, ссылка обнуляется.
    await q(sql`delete from crm_automations where id = ${ids.rule}`);
    expect(await q(sql`select count(*)::int as n from crm_deals where title = ${tag} and automation_id is null`)).toEqual([{ n: 4 }]);
  });
});
