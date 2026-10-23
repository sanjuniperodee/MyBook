import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@/shared/infrastructure/db";
import { DrizzleRuleRepository } from "@/modules/automation/infrastructure/persistence";
import { rulesAdmin } from "@/modules/automation/infrastructure/admin";

/**
 * Журнал срабатываний правила (automation-13, automation-d1) на PostgreSQL: claim → running, итог и шаги, «Повторить»
 * только у ошибки или зависшего, отложенные — по порядку, чистка подробностей без потери отметок.
 * Запуск: INTEGRATION=1 npx vitest run tests/automation-runs.integration.test.ts (база из DATABASE_URL с миграциями).
 */
const run = process.env.INTEGRATION === "1" ? describe : describe.skip;
const tag = `arun${Date.now()}`;

run("automation: журнал срабатываний (PostgreSQL)", () => {
  const repo = new DrizzleRuleRepository();
  let ruleId = "";

  beforeAll(async () => {
    const { rows } = await db.execute<{ id: string }>(sql`insert into crm_automations (name, trigger, active, actions) values (${tag}, 'deal.created', true, '[{"type":"notify","title":"x"}]'::jsonb) returning id`);
    ruleId = rows[0].id;
  });

  afterAll(async () => {
    await db.execute(sql`delete from crm_automations where name = ${tag}`);
    await pool.end();
  });

  it("claim пишет running, finish — итог и шаги; второй claim того же объекта — нет", async () => {
    expect(await repo.claim(ruleId, "deal:1")).toBe(true);
    expect(await repo.claim(ruleId, "deal:1")).toBe(false);
    const [listed] = await rulesAdmin.runs(ruleId);
    expect(listed.status).toBe("running");
    await repo.finish(ruleId, "deal:1", "error", { ctx: { subject: "deal:1", dealId: null }, steps: [{ i: 0, action: "notify", result: "error", note: "x" }], error: "x", failedAt: 0 });
    const [after] = await rulesAdmin.runs(ruleId);
    expect(after).toMatchObject({ status: "error", details: { error: "x", failedAt: 0, steps: [{ i: 0, result: "error" }] } });
    expect((await repo.findRun(after.id))?.details?.ctx.subject).toBe("deal:1");
    expect(await repo.find(ruleId)).toMatchObject({ name: tag, active: true });
  });

  it("restart: ошибку — да и один раз; свежий running — нет, зависший — да", async () => {
    const [r] = await rulesAdmin.runs(ruleId);
    expect(await repo.restart(r.id, ["error", "running"], new Date(Date.now() - 600_000))).toBe(true);
    expect(await repo.restart(r.id, ["error", "running"], new Date(Date.now() - 600_000))).toBe(false);
    await db.execute(sql`update crm_automation_runs set created_at = now() - interval '1 hour' where id = ${r.id}`);
    expect(await repo.restart(r.id, ["error", "running"], new Date(Date.now() - 600_000))).toBe(true);
  });

  it("отложенные — самые старые первыми; чистка подробностей не трогает отложенные и ошибки и не удаляет отметки", async () => {
    for (const [subject, age] of [["deal:2", "3 hours"], ["deal:3", "1 hour"]] as const) {
      await repo.claim(ruleId, subject);
      await repo.finish(ruleId, subject, "deferred", { ctx: { subject }, steps: [{ i: 0, action: "send_message", result: "deferred" }], deferred: [0] });
      await db.execute(sql`update crm_automation_runs set created_at = now() - ${age}::interval where automation_id = ${ruleId} and subject = ${subject}`);
    }
    expect((await repo.deferredRuns(10)).filter((r) => r.ruleId === ruleId).map((r) => r.subject)).toEqual(["deal:2", "deal:3"]);
    await repo.claim(ruleId, "deal:old");
    await repo.finish(ruleId, "deal:old", "done", { ctx: { subject: "deal:old" }, steps: [] });
    await db.execute(sql`update crm_automation_runs set created_at = now() - interval '100 days' where automation_id = ${ruleId} and subject in ('deal:old', 'deal:2')`);
    expect(await repo.purgeDetails(new Date(Date.now() - 90 * 86_400_000), 100)).toBeGreaterThanOrEqual(1);
    const rows = await rulesAdmin.runs(ruleId);
    expect(rows.find((r) => r.subject === "deal:old")?.details).toBeNull();
    expect(rows.find((r) => r.subject === "deal:2")?.details).not.toBeNull();
    expect(await repo.claim(ruleId, "deal:old")).toBe(false);
  });
});
