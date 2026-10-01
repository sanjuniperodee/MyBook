import type { AggregateRoot } from "../domain/AggregateRoot";

/**
 * Единица работы: всё внутри run() — одна транзакция БД. Агрегаты, переданные в track(),
 * отдают свои события, и они публикуются только после успешной фиксации.
 */
export interface UnitOfWork {
  run<T>(work: () => Promise<T>): Promise<T>;
  track(...aggregates: AggregateRoot<object, string | number>[]): void;
}
