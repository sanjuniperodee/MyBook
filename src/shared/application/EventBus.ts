import type { DomainEvent } from "../domain/DomainEvent";

export type EventHandler<E extends DomainEvent = DomainEvent> = (event: E) => Promise<void> | void;

export interface DeliveryReport {
  succeeded: string[];
  failed: { name: string; error: unknown }[];
}

/**
 * Шина доменных событий. Имя подписчика обязательно и стабильно: по нему outbox помнит,
 * кто уже отработал, и при повторе не вызывает его второй раз.
 */
export interface EventBus {
  subscribe<E extends DomainEvent>(type: E["type"] & string, handler: EventHandler<E>, name: string): void;
  /** Доставить событие подписчикам, кроме уже отработавших. */
  deliver(event: DomainEvent, skip?: ReadonlySet<string>): Promise<DeliveryReport>;
  /** Доставить сразу, без outbox (для событий вне транзакции и тестов). */
  publish(events: readonly DomainEvent[]): Promise<void>;
}
