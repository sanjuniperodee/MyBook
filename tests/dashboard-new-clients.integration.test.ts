import { afterAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@/shared/infrastructure/db";
import { dashboard } from "@/modules/reporting/infrastructure/Dashboard";

/**
 * KPI «Новые клиенты» на главной (analytics-d5) на PostgreSQL: заведённые сотрудники не считаются клиентами.
 * Запуск: INTEGRATION=1 npx vitest run tests/dashboard-new-clients.integration.test.ts (база из DATABASE_URL с миграциями).
 */
const run = process.env.INTEGRATION === "1" ? describe : describe.skip;
const tag = `dnc${Date.now()}`;

run("reporting: новые клиенты без сотрудников (PostgreSQL)", () => {
  const viewer = { userId: "00000000-0000-4000-8000-000000000000", seesAll: true };

  afterAll(async () => {
    await db.execute(sql`delete from users where email like ${`${tag}%`}`);
    await pool.end();
  });

  it("клиент добавляет единицу, администратор и менеджер — нет", async () => {
    const before = (await dashboard(7, viewer)).newUsers.cur;
    for (const role of ["user", "admin", "manager"])
      await db.execute(sql`insert into users (email, password_hash, name, role) values (${`${tag}-${role}@test.kz`}, 'x', ${role}, ${role})`);
    expect((await dashboard(7, viewer)).newUsers.cur).toBe(before + 1);
  });
});
