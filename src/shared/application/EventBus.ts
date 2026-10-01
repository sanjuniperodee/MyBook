import type { DomainEvent } from "../domain/DomainEvent";

export type EventHandler<E extends DomainEvent = DomainEvent> = (event: E) => Promise<void> | void;

/**
 * Шина доменных событий. Подписчики других контекстов выполняются после фиксации транзакции
 * (событие не «утечёт», если транзакция откатится); ошибка подписчика не отменяет команду.
 */
export interface EventBus {
  publish(events: readonly DomainEvent[]): Promise<void>;
  subscribe<E extends DomainEvent>(type: E["type"] & string, handler: EventHandler<E>, name?: string): void;
}
