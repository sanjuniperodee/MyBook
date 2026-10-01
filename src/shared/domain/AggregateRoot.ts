import type { DomainEvent } from "./DomainEvent";
import { Entity } from "./Entity";

/**
 * Корень агрегата: граница согласованности. Изменения сохраняются репозиторием целиком,
 * а накопленные события публикуются после фиксации транзакции.
 */
export abstract class AggregateRoot<TProps extends object, TId extends string | number = string> extends Entity<TProps, TId> {
  #events: DomainEvent[] = [];

  protected record(event: DomainEvent): void {
    this.#events.push(event);
  }

  /** Забрать события (репозиторий/Unit of Work вызывает после сохранения). */
  pullEvents(): DomainEvent[] {
    const events = this.#events;
    this.#events = [];
    return events;
  }

  get hasPendingEvents(): boolean {
    return this.#events.length > 0;
  }
}
