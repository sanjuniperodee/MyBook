import "server-only";
import type { AggregateRoot } from "../domain/AggregateRoot";
import type { UnitOfWork } from "../application/UnitOfWork";
import { rootDb, runAfterCommit, txStorage } from "./database";
import type { OutboxDispatcher } from "./OutboxDispatcher";

/**
 * Unit of Work поверх транзакций PostgreSQL. Вложенный run() переиспользует внешнюю транзакцию.
 * События отслеживаемых агрегатов записываются в outbox в той же транзакции, а после COMMIT
 * сразу доставляются; если доставка не удалась или процесс упал — их дошлёт воркер.
 */
export class DrizzleUnitOfWork implements UnitOfWork {
  constructor(private readonly outbox: OutboxDispatcher) {}

  async run<T>(work: () => Promise<T>): Promise<T> {
    if (txStorage.getStore()) return work();
    let ids: string[] = [];
    let after: { afterCommit?: (() => void)[] } | undefined;
    const result = await rootDb.transaction(async (tx) => {
      const ctx: { tx: typeof tx; events: never[]; aggregates: Set<AggregateRoot<object, string | number>>; afterCommit?: (() => void)[] } = { tx, events: [], aggregates: new Set() };
      after = ctx;
      return txStorage.run(ctx, async () => {
        const value = await work();
        const events = [...ctx.aggregates].flatMap((a) => a.pullEvents());
        ids = await this.outbox.enqueue(events);
        return value;
      });
    });
    runAfterCommit(after);
    await this.outbox.dispatch(ids);
    return result;
  }

  track(...aggregates: AggregateRoot<object, string | number>[]): void {
    const ctx = txStorage.getStore();
    if (!ctx) throw new Error("UnitOfWork.track() called outside run()");
    for (const a of aggregates) ctx.aggregates.add(a);
  }
}
