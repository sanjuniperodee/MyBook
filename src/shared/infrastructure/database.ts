import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { db as rootDb } from "@/shared/infrastructure/db";
import type * as schema from "@/shared/infrastructure/db/schema";

export type Database = NodePgDatabase<typeof schema>;
/** Транзакция Drizzle — тот же интерфейс запросов, что и у базы. */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type Executor = Database | Transaction;

interface TxContext {
  tx: Transaction;
  events: import("../domain/DomainEvent").DomainEvent[];
  aggregates: Set<import("../domain/AggregateRoot").AggregateRoot<object, string | number>>;
  /** Что сделать после COMMIT внешней транзакции (afterCommit); при откате — ничего. */
  afterCommit?: (() => void)[];
}

export const txStorage = new AsyncLocalStorage<TxContext>();

/**
 * Сделать после COMMIT текущей транзакции — например, сбросить кэш: сброшенный до COMMIT кэш соседний запрос успел бы
 * заполнить старыми значениями. Вне транзакции — сразу; при откате — не делается.
 */
export function afterCommit(fn: () => void) {
  const ctx = txStorage.getStore();
  if (!ctx) return fn();
  (ctx.afterCommit ??= []).push(fn);
}

/** Транзакция зафиксирована — выполнить отложенное (ошибка одного не мешает остальным). */
export function runAfterCommit(ctx: { afterCommit?: (() => void)[] } | undefined) {
  for (const fn of ctx?.afterCommit ?? []) {
    try {
      fn();
    } catch (err) {
      console.error("[db] afterCommit", err);
    }
  }
}

/**
 * Исполнитель запросов для репозитория: текущая транзакция Unit of Work, если она открыта,
 * иначе — общий пул. Репозитории не знают, в транзакции они или нет.
 */
export function executor(): Executor {
  return txStorage.getStore()?.tx ?? rootDb;
}

/**
 * Выполнить в транзакции: внутри уже открытой (Unit of Work) — в ней же, иначе — в своей. Для репозиториев,
 * которым нужна блокировка строк (SELECT … FOR UPDATE) до конца записи, даже если их вызвали вне Unit of Work.
 * События агрегатов здесь не собираются: внутри inTransaction не вызывайте uow.run/track — их события не попадут
 * в outbox (DrizzleUnitOfWork примет этот контекст за внешнюю транзакцию). Только простые запросы репозитория.
 */
export async function inTransaction<T>(work: () => Promise<T>): Promise<T> {
  if (txStorage.getStore()) return work();
  let ctx: TxContext | undefined;
  const result = await rootDb.transaction((tx) => txStorage.run((ctx = { tx, events: [], aggregates: new Set() }), work));
  runAfterCommit(ctx);
  return result;
}

export { rootDb };
