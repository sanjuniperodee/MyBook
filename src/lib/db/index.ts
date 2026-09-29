import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { __mybookPool?: Pool; __mybookDb?: NodePgDatabase<typeof schema> };

function createPool() {
  return new Pool({
    connectionString: process.env.DATABASE_URL ?? "postgres://mybook:mybook@localhost:5432/mybook",
    max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
  });
}

export const pool = globalForDb.__mybookPool ?? createPool();
export const db = globalForDb.__mybookDb ?? drizzle(pool, { schema });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__mybookPool = pool;
  globalForDb.__mybookDb = db;
}

export { schema };
