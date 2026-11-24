import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/shared/infrastructure/db/schema";

const globalForDb = globalThis as unknown as { __mybookPool?: Pool; __mybookDb?: NodePgDatabase<typeof schema> };

/**
 * Пул на процесс: 6 (было 10) — каждое соединение — отдельный процесс Postgres (2–5 МБ, бывает 20); у сайта два
 * держатся долго (LISTEN живых обновлений, замок тяжёлой сборки PDF), на запросы остаётся 4. mybook-worker — 4
 * (DATABASE_POOL_SIZE в deploy/ecosystem.config.cjs). Простаивающее соединение закрывается через 10 с.
 * Пик занятых и очередь — в журнале замеров (kind: mem, db*), см. poolStats.
 */
function createPool() {
  const p = new Pool({
    connectionString: process.env.DATABASE_URL ?? "postgres://mybook:mybook@localhost:5432/mybook",
    max: Number(process.env.DATABASE_POOL_SIZE) || 6,
    idleTimeoutMillis: Number(process.env.DATABASE_IDLE_MS) || 10_000,
  });
  const stats = poolStats();
  const note = () => {
    stats.peakBusy = Math.max(stats.peakBusy, p.totalCount - p.idleCount);
    stats.peakWaiting = Math.max(stats.peakWaiting, p.waitingCount);
  };
  p.on("acquire", note);
  p.on("connect", note);
  stats.read = () => ({ total: p.totalCount, idle: p.idleCount, waiting: p.waitingCount, max: Number(process.env.DATABASE_POOL_SIZE) || 6 });
  return p;
}

type PoolStats = { peakBusy: number; peakWaiting: number; read?: () => { total: number; idle: number; waiting: number; max: number } };
/** Счётчики пула — в globalThis: журнал замеров (perfLog) читает их, не загружая этот модуль. */
export function poolStats(): PoolStats {
  const g = globalThis as Record<symbol, unknown>;
  return (g[Symbol.for("mybook.poolStats")] ??= { peakBusy: 0, peakWaiting: 0 }) as PoolStats;
}

export const pool = globalForDb.__mybookPool ?? createPool();
export const db = globalForDb.__mybookDb ?? drizzle(pool, { schema });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__mybookPool = pool;
  globalForDb.__mybookDb = db;
}
