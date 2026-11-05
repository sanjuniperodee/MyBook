/**
 * Процесс mybook-worker: фоновая работа сайта отдельно от обработки запросов (ADR 0009).
 * Собирается scripts/build-worker.mjs в .next/standalone/worker.mjs и запускается PM2 рядом с server.js того же релиза.
 *
 * Миграции не применяет: их применяет проверочная копия сайта при выкатке до переключения. Но если воркер стартовал
 * раньше (ручной запуск, рестарт посреди выкатки), он ждёт, пока в базе будут все миграции релиза, — иначе новый код
 * пошёл бы по старой схеме.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pool } from "@/shared/infrastructure/db";
import { startCatalogSync } from "@/server/catalog";
import { startBackground } from "@/server/background";
import { configureSharpMemory } from "@/shared/infrastructure/sharpMemory";

const MIGRATIONS_WAIT_MS = 10 * 60_000;

/** Сколько миграций в релизе (drizzle/meta/_journal.json) и сколько применено в базе. */
export async function migrationsState(dir = path.join(process.cwd(), "drizzle")) {
  const journal = JSON.parse(await readFile(path.join(dir, "meta", "_journal.json"), "utf8")) as { entries: unknown[] };
  try {
    const { rows } = await pool.query<{ n: string }>("select count(*) as n from drizzle.__drizzle_migrations");
    return { expected: journal.entries.length, applied: Number(rows[0]?.n ?? 0) };
  } catch (err) {
    // Базы ещё нет или она недоступна: ждём, как и неприменённых миграций.
    console.warn("[worker] cannot read applied migrations:", err instanceof Error ? err.message : err);
    return { expected: journal.entries.length, applied: 0 };
  }
}

async function waitForMigrations() {
  const deadline = Date.now() + MIGRATIONS_WAIT_MS;
  for (;;) {
    const { expected, applied } = await migrationsState();
    if (applied >= expected) return;
    if (Date.now() > deadline) {
      console.warn(`[worker] migrations ${applied}/${expected} after ${MIGRATIONS_WAIT_MS / 60_000} min — starting anyway`);
      return;
    }
    console.log(`[worker] waiting for migrations ${applied}/${expected}`);
    await new Promise((r) => setTimeout(r, 5_000));
  }
}

async function main() {
  await configureSharpMemory();
  await waitForMigrations();
  startCatalogSync();
  // Видео, ждавшие обработки: сразу — выкатка сайта воркер не ждёт.
  await startBackground({ answerFilesDelayMs: 5_000 });
  console.log(`[worker] background jobs started (pid ${process.pid})`);
}

// Таймеры фона сделаны unref (чтобы не держать сайт при остановке); здесь процесс живёт ради них, поэтому держим его сами.
const keepAlive = setInterval(() => {}, 1 << 30);
const stop = (signal: string) => {
  console.log(`[worker] ${signal}, stopping`);
  clearInterval(keepAlive);
  // Текущий проход дописывается за секунды; PM2 добьёт по kill_timeout.
  setTimeout(() => process.exit(0), 2_000).unref();
};
process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));

main().catch((err) => {
  console.error("[worker] failed to start", err);
  process.exit(1);
});
