/** Таблица общего ядра: outbox доменных событий. */
import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Transactional outbox: доменные события пишутся в той же транзакции, что и изменения агрегатов,
 * а воркер доставляет их подписчикам с повторами. Событие не теряется, даже если процесс упал
 * сразу после COMMIT. delivered — подписчики, которые уже отработали (повтор их не вызовет).
 */
export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<unknown>().notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    delivered: text("delivered").array().notNull().default(sql`'{}'::text[]`),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    /** Не раньше этого времени (повтор с нарастающей паузой). */
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    /** Кто-то уже доставляет событие — до этого времени его не трогаем. */
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    /** Попытки исчерпаны — событие ждёт разбора (dead letter). */
    failedAt: timestamp("failed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("outbox_pending_idx").on(t.processedAt, t.availableAt)],
);
