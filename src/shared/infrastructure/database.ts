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
}

export const txStorage = new AsyncLocalStorage<TxContext>();

/**
 * Исполнитель запросов для репозитория: текущая транзакция Unit of Work, если она открыта,
 * иначе — общий пул. Репозитории не знают, в транзакции они или нет.
 */
export function executor(): Executor {
  return txStorage.getStore()?.tx ?? rootDb;
}

export { rootDb };
