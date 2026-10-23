import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@/shared/infrastructure/db";
import { dashboard } from "@/modules/reporting/infrastructure/Dashboard";
import { salesAnalytics } from "@/modules/reporting/infrastructure/SalesAnalytics";

/**
 * Договорённость без платежа в «Выручке» и «Получено деньгами» (analytics-d6) на PostgreSQL: успешная сделка без заказа
 * и платежей входит в журнал своей суммой — отдельно подсчитана (agreed), чтобы экран её подписал; с платежом — нет.
 * Запуск: INTEGRATION=1 npx vitest run tests/revenue-agreed.integration.test.ts (база из DATABASE_URL с миграциями).
 */
const run = process.env.INTEGRATION === "1" ? describe : describe.skip;
const tag = `rag${Date.now()}`;

run("reporting: договорённость без платежа подписана (PostgreSQL)", () => {
  const one = async (query: ReturnType<typeof sql>) => (await db.execute<{ id: string }>(query)).rows[0].id;
  const viewer = { userId: "00000000-0000-4000-8000-000000000000", seesAll: true };
  let staff = "";
  let pipeline = "";
  let before: { cur: number; agreed: number; received: number; receivedAgreed: number };

  const snapshot = async () => {
    const d = await dashboard(7, viewer);
    const a = await salesAnalytics(pipeline, 7);
    const m = a.managers.rows.find((r) => r.id === staff);
    return { cur: d.cur.sum, agreed: d.cur.agreed, received: Number(a.received.rows[0]?.agreed ?? 0), receivedAgreed: Number(m?.received_agreed ?? 0) };
  };

  beforeAll(async () => {
    staff = await one(sql`insert into users (email, password_hash, name, role) values (${`${tag}-m@test.kz`}, 'x', 'М', 'admin') returning id`);
    const [won] = (await db.execute<{ id: string; pipeline_id: string }>(sql`select id, pipeline_id from crm_stages where kind = 'won' order by position limit 1`)).rows;
    pipeline = won.pipeline_id;
    before = await snapshot();
    // Успешная без платежа — договорённость 30 000; успешная с платежом 15 000 — деньги, не договорённость.
    await one(sql`insert into crm_deals (title, stage_id, assignee_id, amount, closed_at) values (${tag}, ${won.id}, ${staff}, 30000, now()) returning id`);
    const paid = await one(sql`insert into crm_deals (title, stage_id, assignee_id, amount, closed_at) values (${tag}, ${won.id}, ${staff}, 40000, now()) returning id`);
    await db.execute(sql`insert into crm_payments (deal_id, amount, kind, paid_at) values (${paid}, 15000, 'payment', now())`);
  });

  afterAll(async () => {
    await db.execute(sql`delete from crm_payments where deal_id in (select id from crm_deals where title = ${tag})`);
    await db.execute(sql`delete from crm_deals where title = ${tag}`);
    await db.execute(sql`delete from users where email like ${`${tag}%`}`);
    await pool.end();
  });

  it("выручка +45 000, из них договорённость 30 000; у менеджера — те же 30 000 подписаны", async () => {
    const after = await snapshot();
    expect({ cur: after.cur - before.cur, agreed: after.agreed - before.agreed, received: after.received - before.received, manager: after.receivedAgreed - before.receivedAgreed }).toEqual({
      cur: 45_000,
      agreed: 30_000,
      received: 30_000,
      manager: 30_000,
    });
  });
});
