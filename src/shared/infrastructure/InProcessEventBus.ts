import "server-only";
import type { DomainEvent } from "../domain/DomainEvent";
import type { DeliveryReport, EventBus, EventHandler } from "../application/EventBus";
import { consoleLogger, type Logger } from "../application/Logger";

/**
 * Реестр подписчиков в процессе приложения. Надёжность (повторы, переживание рестарта) обеспечивает
 * OutboxDispatcher: он хранит события в Postgres и вызывает deliver() до успеха.
 */
export class InProcessEventBus implements EventBus {
  readonly #handlers = new Map<string, { name: string; handler: EventHandler }[]>();

  constructor(private readonly logger: Logger = consoleLogger("events")) {}

  subscribe<E extends DomainEvent>(type: E["type"] & string, handler: EventHandler<E>, name: string): void {
    const list = this.#handlers.get(type) ?? [];
    if (list.some((h) => h.name === name)) throw new Error(`duplicate subscriber ${name} for ${type}`);
    list.push({ name, handler: handler as EventHandler });
    this.#handlers.set(type, list);
  }

  handlerNames(type: string): string[] {
    return (this.#handlers.get(type) ?? []).map((h) => h.name);
  }

  async deliver(event: DomainEvent, skip: ReadonlySet<string> = new Set()): Promise<DeliveryReport> {
    const report: DeliveryReport = { succeeded: [], failed: [] };
    for (const { name, handler } of this.#handlers.get(event.type) ?? []) {
      if (skip.has(name)) continue;
      try {
        await handler(event);
        report.succeeded.push(name);
      } catch (error) {
        this.logger.error(`handler ${name} failed for ${event.type}`, error);
        report.failed.push({ name, error });
      }
    }
    return report;
  }

  async publish(events: readonly DomainEvent[]): Promise<void> {
    for (const e of events) await this.deliver(e);
  }
}
