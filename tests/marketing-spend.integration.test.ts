import { afterAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@/shared/infrastructure/db";
import { drizzleSpend, sqlReportSource } from "@/modules/marketing/infrastructure/persistence";

/**
 * Расходы на рекламу (analytics-7) на PostgreSQL: запись, последние, удаление; в отчёте — сумма по каналу за период.
 * Запуск: INTEGRATION=1 npx vitest run tests/marketing-spend.integration.test.ts (база из DATABASE_URL с миграциями).
 */
const run = process.env.INTEGRATION === "1" ? describe : describe.skip;
const tag = `msp${Date.now()}`;

run("marketing: расходы на рекламу (PostgreSQL)", () => {
  afterAll(async () => {
    await db.execute(sql`delete from marketing_spend where note = ${tag}`);
    await pool.end();
  });

  it("сумма канала за период; старый расход — вне периода; удаление", async () => {
    const before = ((await sqlReportSource.rows(new Date(Date.now() - 7 * 86_400_000))).spend ?? []).find((s) => s.channel === "vk")?.amount ?? 0;
    const today = new Date().toISOString().slice(0, 10);
    const a = await drizzleSpend.add({ channel: "vk", day: today, amount: 7000, note: tag, createdById: null as unknown as string });
    await drizzleSpend.add({ channel: "vk", day: "2020-01-01", amount: 99000, note: tag, createdById: null as unknown as string });
    const after = ((await sqlReportSource.rows(new Date(Date.now() - 7 * 86_400_000))).spend ?? []).find((s) => s.channel === "vk")?.amount ?? 0;
    expect(after - before).toBe(7000);
    expect((await drizzleSpend.recent(50)).some((r) => r.id === a)).toBe(true);
    expect(await drizzleSpend.remove(a)).toMatchObject({ channel: "vk", amount: 7000 });
    expect(await drizzleSpend.remove(a)).toBeNull();
  });
});
