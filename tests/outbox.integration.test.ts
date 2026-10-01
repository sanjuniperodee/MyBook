import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { AggregateRoot, domainEvent } from "@/shared/domain";
import { DrizzleUnitOfWork, InProcessEventBus, OutboxDispatcher, rootDb } from "@/shared/infrastructure";
import { outboxEvents } from "@/lib/db/schema";
import { pool } from "@/lib/db";

/**
 * Интеграционный тест outbox на настоящем PostgreSQL. Запуск: INTEGRATION=1 npx vitest run tests/outbox.integration.test.ts
 * (нужна база из DATABASE_URL с применёнными миграциями).
 */
const run = process.env.INTEGRATION === "1" ? describe : describe.skip;

class Thing extends AggregateRoot<{ n: number }> {
  static make(n: number) {
    const t = new Thing(`t${n}`, { n });
    t.record(domainEvent("test.thing_made", { n, tag: TAG }));
    return t;
  }
}
const TAG = `it-${Date.now()}`;
const silent = { info() {}, warn() {}, error() {} };

run("outbox (PostgreSQL)", () => {
  const bus = new InProcessEventBus(silent);
  const outbox = new OutboxDispatcher(bus, silent);
  const uow = new DrizzleUnitOfWork(outbox);
  const calls = { mail: 0, crm: 0 };
  let crmFailures = 1;
  bus.subscribe<ReturnType<typeof domainEvent<"test.thing_made", { n: number; tag: string }>>>(
    "test.thing_made",
    async (e) => {
      if (e.payload.tag === TAG) calls.mail++;
    },
    "test.mail",
  );
  bus.subscribe<ReturnType<typeof domainEvent<"test.thing_made", { n: number; tag: string }>>>(
    "test.thing_made",
    async (e) => {
      if (e.payload.tag !== TAG) return;
      calls.crm++;
      if (crmFailures-- > 0) throw new Error("CRM временно недоступна");
    },
    "test.crm",
  );
  const rows = () => rootDb.select().from(outboxEvents).where(eq(outboxEvents.type, "test.thing_made"));

  afterAll(async () => {
    const ids = (await rows()).filter((r) => (r.payload as { tag?: string }).tag === TAG).map((r) => r.id);
    if (ids.length) await rootDb.delete(outboxEvents).where(inArray(outboxEvents.id, ids));
    await pool.end();
  });

  it("событие пишется в транзакции; упавший подписчик повторяется, успешный — нет", async () => {
    await uow.run(async () => uow.track(Thing.make(1)));
    expect(calls).toEqual({ mail: 1, crm: 1 });
    let [row] = (await rows()).filter((r) => (r.payload as { tag: string }).tag === TAG);
    expect(row).toMatchObject({ delivered: ["test.mail"], attempts: 1, processedAt: null });
    expect(row.lastError).toContain("CRM временно недоступна");

    await rootDb.update(outboxEvents).set({ availableAt: new Date(0) }).where(eq(outboxEvents.id, row.id));
    await outbox.dispatch();
    [row] = (await rows()).filter((r) => r.id === row.id);
    expect(calls).toEqual({ mail: 1, crm: 2 });
    expect(row.delivered).toEqual(["test.mail", "test.crm"]);
    expect(row.processedAt).not.toBeNull();
  });

  it("откат транзакции — события нет", async () => {
    const before = (await rows()).length;
    await expect(
      uow.run(async () => {
        uow.track(Thing.make(2));
        throw new Error("бизнес-правило нарушено");
      }),
    ).rejects.toThrow();
    expect((await rows()).length).toBe(before);
  });

  it("после исчерпания попыток — dead letter", async () => {
    crmFailures = 100;
    await uow.run(async () => uow.track(Thing.make(3)));
    const [row] = (await rows()).filter((r) => (r.payload as { n: number; tag: string }).n === 3 && (r.payload as { tag: string }).tag === TAG);
    await rootDb.update(outboxEvents).set({ attempts: 9, availableAt: new Date(0) }).where(eq(outboxEvents.id, row.id));
    await outbox.dispatch([row.id]);
    const [dead] = await rootDb.select().from(outboxEvents).where(eq(outboxEvents.id, row.id));
    expect(dead.failedAt).not.toBeNull();
    expect((await outbox.stats()).failed).toBeGreaterThan(0);
  });
});
