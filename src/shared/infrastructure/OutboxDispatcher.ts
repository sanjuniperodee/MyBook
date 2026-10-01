import "server-only";
import { and, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { outboxEvents } from "@/lib/db/schema";
import type { DomainEvent } from "../domain/DomainEvent";
import type { EventBus } from "../application/EventBus";
import { consoleLogger, type Logger } from "../application/Logger";
import { executor, rootDb } from "./database";

const MAX_ATTEMPTS = 10;
const LOCK_MS = 120_000;
/** 10 с, 20 с, 40 с … до часа. */
const backoffMs = (attempt: number) => Math.min(10_000 * 2 ** (attempt - 1), 3_600_000);

/**
 * Transactional outbox. enqueue() вызывается внутри транзакции команды — событие и изменения
 * агрегата фиксируются атомарно. dispatch() доставляет: сразу после COMMIT (быстрый путь) и
 * периодически из планировщика (повторы, события после падения процесса). Строки захватываются
 * через FOR UPDATE SKIP LOCKED — несколько инстансов не доставят одно событие дважды.
 */
export class OutboxDispatcher {
  constructor(
    private readonly bus: EventBus,
    private readonly logger: Logger = consoleLogger("outbox"),
  ) {}

  /** Записать события в текущей транзакции. Возвращает id строк для быстрой доставки. */
  async enqueue(events: readonly DomainEvent[]): Promise<string[]> {
    if (!events.length) return [];
    const rows = await executor()
      .insert(outboxEvents)
      .values(events.map((e) => ({ type: e.type, payload: e.payload as object, occurredAt: e.occurredAt })))
      .returning({ id: outboxEvents.id });
    return rows.map((r) => r.id);
  }

  /** Доставить конкретные события (после COMMIT) или все созревшие (воркер). Возвращает число обработанных. */
  async dispatch(ids?: string[], limit = 50): Promise<number> {
    if (ids && !ids.length) return 0;
    const now = new Date();
    const due = ids ? inArray(outboxEvents.id, ids) : lte(outboxEvents.availableAt, now);
    const claimable = and(due, isNull(outboxEvents.processedAt), isNull(outboxEvents.failedAt), or(isNull(outboxEvents.lockedUntil), lte(outboxEvents.lockedUntil, now)));
    const claimed = await rootDb.transaction(async (tx) => {
      const free = await tx.select({ id: outboxEvents.id }).from(outboxEvents).where(claimable).orderBy(outboxEvents.createdAt).limit(limit).for("update", { skipLocked: true });
      if (!free.length) return [];
      return tx
        .update(outboxEvents)
        .set({ lockedUntil: new Date(now.getTime() + LOCK_MS) })
        .where(inArray(outboxEvents.id, free.map((r) => r.id)))
        .returning();
    });
    for (const row of claimed) {
      const event: DomainEvent = { type: row.type, payload: row.payload, occurredAt: row.occurredAt };
      const report = await this.bus.deliver(event, new Set(row.delivered));
      const delivered = [...row.delivered, ...report.succeeded];
      if (!report.failed.length) {
        await rootDb.update(outboxEvents).set({ delivered, processedAt: new Date(), lockedUntil: null, lastError: null }).where(inArray(outboxEvents.id, [row.id]));
        continue;
      }
      const attempts = row.attempts + 1;
      const lastError = report.failed.map((f) => `${f.name}: ${f.error instanceof Error ? f.error.message : String(f.error)}`).join("; ").slice(0, 2000);
      const dead = attempts >= MAX_ATTEMPTS;
      if (dead) this.logger.error(`event ${row.type} ${row.id} moved to dead letter after ${attempts} attempts`, lastError);
      await rootDb
        .update(outboxEvents)
        .set({ delivered, attempts, lastError, lockedUntil: null, availableAt: new Date(Date.now() + backoffMs(attempts)), ...(dead ? { failedAt: new Date() } : {}) })
        .where(inArray(outboxEvents.id, [row.id]));
    }
    return claimed.length;
  }

  /** Сводка для мониторинга (/api/health, CRM). */
  async stats() {
    const [r] = await rootDb
      .select({
        pending: sql<number>`count(*) filter (where ${outboxEvents.processedAt} is null and ${outboxEvents.failedAt} is null)::int`,
        failed: sql<number>`count(*) filter (where ${outboxEvents.failedAt} is not null)::int`,
        oldestPendingSec: sql<number | null>`extract(epoch from now() - min(${outboxEvents.createdAt}) filter (where ${outboxEvents.processedAt} is null and ${outboxEvents.failedAt} is null))::int`,
      })
      .from(outboxEvents);
    return r;
  }

  /** Обработанные события старше N дней не нужны. */
  async purge(olderThanDays = 14) {
    await rootDb.delete(outboxEvents).where(lte(outboxEvents.processedAt, new Date(Date.now() - olderThanDays * 86_400_000)));
  }
}
