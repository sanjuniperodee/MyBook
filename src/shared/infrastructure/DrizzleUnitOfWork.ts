import "server-only";
import type { AggregateRoot } from "../domain/AggregateRoot";
import type { DomainEvent } from "../domain/DomainEvent";
import type { EventBus } from "../application/EventBus";
import type { UnitOfWork } from "../application/UnitOfWork";
import { rootDb, txStorage } from "./database";

/**
 * Unit of Work поверх транзакций PostgreSQL. Вложенный run() переиспользует внешнюю транзакцию.
 * События отслеживаемых агрегатов собираются и публикуются после COMMIT.
 */
export class DrizzleUnitOfWork implements UnitOfWork {
  constructor(private readonly bus: EventBus) {}

  async run<T>(work: () => Promise<T>): Promise<T> {
    const outer = txStorage.getStore();
    if (outer) return work();
    const events: DomainEvent[] = [];
    const result = await rootDb.transaction(async (tx) => {
      const ctx = { tx, events, aggregates: new Set<AggregateRoot<object, string | number>>() };
      return txStorage.run(ctx, async () => {
        const value = await work();
        for (const a of ctx.aggregates) events.push(...a.pullEvents());
        return value;
      });
    });
    await this.bus.publish(events);
    return result;
  }

  track(...aggregates: AggregateRoot<object, string | number>[]): void {
    const ctx = txStorage.getStore();
    if (!ctx) throw new Error("UnitOfWork.track() called outside run()");
    for (const a of aggregates) ctx.aggregates.add(a);
  }
}
