import "server-only";
import type { DomainEvent } from "../domain/DomainEvent";
import type { EventBus, EventHandler } from "../application/EventBus";
import { consoleLogger, type Logger } from "../application/Logger";

/**
 * Шина событий в процессе приложения. Подписчики выполняются последовательно; ошибка одного
 * пишется в лог и не мешает остальным и исходной команде. Для монолита на одном инстансе
 * этого достаточно; при росте — заменить на outbox + очередь без изменения домена.
 */
export class InProcessEventBus implements EventBus {
  readonly #handlers = new Map<string, { name: string; handler: EventHandler }[]>();

  constructor(private readonly logger: Logger = consoleLogger("events")) {}

  subscribe<E extends DomainEvent>(type: E["type"] & string, handler: EventHandler<E>, name = handler.name || "anonymous"): void {
    const list = this.#handlers.get(type) ?? [];
    list.push({ name, handler: handler as EventHandler });
    this.#handlers.set(type, list);
  }

  async publish(events: readonly DomainEvent[]): Promise<void> {
    for (const event of events) {
      for (const { name, handler } of this.#handlers.get(event.type) ?? []) {
        try {
          await handler(event);
        } catch (err) {
          this.logger.error(`handler ${name} failed for ${event.type}`, err);
        }
      }
    }
  }
}
