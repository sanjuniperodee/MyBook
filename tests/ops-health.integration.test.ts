import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@/shared/infrastructure/db";
import { drizzleOpsAlerts, drizzleOpsFacts, drizzlePulseStore } from "@/modules/monitoring/infrastructure/persistence";

/**
 * «Фон и очереди» на PostgreSQL: пульс (счётчики и «ошибок подряд» в upsert), агрегаты очередей и их планы по индексам.
 * Запуск: INTEGRATION=1 npx vitest run tests/ops-health.integration.test.ts (база из DATABASE_URL с миграциями).
 */
const run = process.env.INTEGRATION === "1" ? describe : describe.skip;
const tag = `ops${Date.now()}`;

run("monitoring: пульс и агрегаты (PostgreSQL)", () => {
  const now = new Date();
  const ago = (sec: number) => new Date(now.getTime() - sec * 1000);
  const job = (s: string) => `${tag}:${s}`;

  beforeAll(async () => {
    await db.execute(sql`insert into outbox_events (type, payload, occurred_at, created_at, available_at, attempts, last_error) values
      (${`${tag}.due`}, '{}', ${ago(400)}, ${ago(400)}, ${ago(400)}, 0, null),
      (${`${tag}.retry`}, '{}', ${ago(100)}, ${ago(100)}, ${new Date(now.getTime() + 60_000)}, 2, 'sub: boom')`);
    await db.execute(sql`insert into outbox_events (type, payload, occurred_at, created_at, attempts, last_error, failed_at) values (${`${tag}.dead`}, '{}', ${ago(900)}, ${ago(900)}, 10, 'mail: smtp down', ${ago(300)})`);
    await db.execute(sql`insert into outbox_events (type, payload, occurred_at, processed_at) values (${`${tag}.done`}, '{}', ${ago(60)}, ${ago(30)})`);
  });

  afterAll(async () => {
    await db.execute(sql`delete from outbox_events where type like ${`${tag}.%`}`);
    await db.execute(sql`delete from job_pulses where job like ${`${tag}:%`}`);
    await db.execute(sql`delete from ops_alerts where stream like ${`${tag}%`}`);
    await pool.end();
  });

  it("пульс: начало, итоги, ошибок подряд и счётчики", async () => {
    await drizzlePulseStore.start(job("crm"), 60, ago(30));
    const rec = (outcome: "ok" | "error", error: string | null, at: Date) => ({ job: job("crm"), everySec: 60, startedAt: new Date(at.getTime() - 500), finishedAt: at, outcome, error, note: null });
    await drizzlePulseStore.finish([rec("error", "first", ago(20)), { ...rec("ok", null, ago(20)), job: job("step") }]);
    await drizzlePulseStore.finish([rec("error", "second", ago(10))]);
    let row = (await drizzlePulseStore.all()).find((r) => r.job === job("crm"))!;
    expect(row).toMatchObject({ everySec: 60, outcome: "error", fails: 2, runs: 2, failures: 2, error: "second", okAt: null, durationMs: 500 });
    expect(row.errorAt).toEqual(ago(10));
    await drizzlePulseStore.finish([rec("ok", null, ago(5))]);
    row = (await drizzlePulseStore.all()).find((r) => r.job === job("crm"))!;
    expect(row).toMatchObject({ outcome: "ok", fails: 0, runs: 3, failures: 2, error: "second" });
    expect(row.okAt).toEqual(ago(5));
    expect((await drizzlePulseStore.all()).find((r) => r.job === job("step"))).toMatchObject({ runs: 1, fails: 0 });
  });

  it("агрегаты outbox: ждёт, повторяется, в разборе, доставлено за час", async () => {
    const f = await drizzleOpsFacts.facts(now, { voices: true });
    expect(f.outbox.pending).toBeGreaterThanOrEqual(2);
    expect(f.outbox.retrying).toBeGreaterThanOrEqual(1);
    expect(f.outbox.dead).toBeGreaterThanOrEqual(1);
    expect(f.outbox.deliveredHour).toBeGreaterThanOrEqual(1);
    expect(f.outbox.dueOldestAt!.getTime()).toBeLessThanOrEqual(ago(400).getTime());
    expect(f.outbox.deadLastType).toBe(`${tag}.dead`);
    expect(f.outbox.deadLastError).toBe("mail: smtp down");
    expect(f.voices).toMatchObject({ waiting: expect.any(Number) });
    expect(typeof f.messages.errorsHour).toBe("number");
    expect(typeof f.media.queued).toBe("number");
    expect(typeof f.mail.sentDay).toBe("number");
    expect((await drizzleOpsFacts.facts(now, { voices: false })).voices).toBeNull();
  });

  it("недоставленные outbox и сообщения — по частичным индексам", async () => {
    await db.execute(sql`set enable_seqscan = off`);
    const plan = async (q: ReturnType<typeof sql>) => (await db.execute<{ "QUERY PLAN": string }>(sql`explain ${q}`)).rows.map((r) => r["QUERY PLAN"]).join("\n");
    expect(await plan(sql`select count(*) from outbox_events where processed_at is null`)).toContain("outbox_unprocessed_idx");
    expect(await plan(sql`select count(*) from crm_messages where status = 'pending' and created_at >= now() - interval '1 day'`)).toContain("crm_messages_pending_idx");
    expect(await plan(sql`select count(*) from crm_messages where type = 'audio' and transcript is null and deleted_at is null and created_at >= now() - interval '3 days'`)).toContain("crm_messages_untranscribed_idx");
    await db.execute(sql`reset enable_seqscan`);
  });

  it("состояние оповещений", async () => {
    await drizzleOpsAlerts.save(`${tag}x`, { downSince: ago(60), notifiedAt: null });
    await drizzleOpsAlerts.save(`${tag}x`, { downSince: ago(60), notifiedAt: ago(1) });
    expect((await drizzleOpsAlerts.all()).get(`${tag}x`)).toEqual({ downSince: ago(60), notifiedAt: ago(1) });
  });
});
