import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@/shared/infrastructure/db";
import { drizzleTasks } from "@/modules/clients/infrastructure/persistence";

/**
 * Просроченные задачи (tasks-4) и задачи проигранной сделки (tasks-6) на PostgreSQL: окно «неделя — полчаса назад»,
 * отметка один раз; закрытие открытых задач сделки с итогом, выполненные не трогаются.
 * Запуск: INTEGRATION=1 npx vitest run tests/task-overdue.integration.test.ts (база из DATABASE_URL с миграциями).
 */
const run = process.env.INTEGRATION === "1" ? describe : describe.skip;
const tag = `tov${Date.now()}`;

run("clients: просрочка и задачи проигранной сделки (PostgreSQL)", () => {
  const q = async <T extends Record<string, unknown>>(query: ReturnType<typeof sql>) => (await db.execute<T>(query)).rows;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const [stage] = await q<{ id: string }>(sql`select id from crm_stages where kind = 'open' order by position limit 1`);
    const [deal] = await q<{ id: string }>(sql`insert into crm_deals (title, stage_id) values (${tag}, ${stage.id}) returning id`);
    ids.deal = deal.id;
    const task = async (key: string, due: string | null, done = false) => {
      const [t] = await q<{ id: string }>(sql`insert into crm_tasks (title, deal_id, due_at, done_at, result) values (${`${tag}-${key}`}, ${ids.deal}, ${due ? sql`now() - ${due}::interval` : null}, ${done ? sql`now()` : null}, ${done ? "своё" : null}) returning id`);
      ids[key] = t.id;
    };
    await task("late", "45 minutes");
    await task("fresh", "10 minutes");
    await task("ancient", "9 days");
    await task("done", "2 hours", true);
    await task("nodue", null);
  });

  afterAll(async () => {
    await q(sql`delete from crm_tasks where title like ${tag + "%"}`);
    await q(sql`delete from crm_deals where title = ${tag}`);
    await pool.end();
  });

  it("просрочка: только в окне и один раз", async () => {
    const mine = (rows: { id: string }[]) => rows.map((r) => Object.entries(ids).find(([, v]) => v === r.id)?.[0]).filter(Boolean);
    expect(mine(await drizzleTasks.claimOverdue(new Date(), 30, 500))).toEqual(["late"]);
    expect(mine(await drizzleTasks.claimOverdue(new Date(), 30, 500))).toEqual([]);
  });

  it("проигранная сделка: открытые задачи — выполнены с итогом, выполненная — со своим", async () => {
    expect(await drizzleTasks.closeOpenOfDeal({ dealId: ids.deal, result: "Сделка проиграна", at: new Date() })).toBe(4);
    const rows = await q<{ id: string; result: string | null; done_at: Date | null }>(sql`select id, result, done_at from crm_tasks where deal_id = ${ids.deal}`);
    expect(rows.every((r) => r.done_at)).toBe(true);
    expect(rows.find((r) => r.id === ids.done)?.result).toBe("своё");
    expect(rows.find((r) => r.id === ids.late)?.result).toBe("Сделка проиграна");
  });
});
