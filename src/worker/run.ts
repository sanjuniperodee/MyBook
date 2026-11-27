/**
 * Работа процесса mybook-worker — одна для обоих входов: прежнего (src/worker/main.ts → worker.mjs) и бэкенда на Nest
 * (apps/backend/src/worker.ts → backend-worker.mjs, ADR 0014, шаг 6; зовёт эти функции через legacy/worker.ports.ts).
 *
 * Миграции воркер не применяет: их применяет выкатка до переключения. Но если он стартовал раньше (ручной запуск,
 * рестарт посреди выкатки), он ждёт, пока в базе будут все миграции релиза, — иначе новый код пошёл бы по старой схеме.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { startBackground } from "@/server/background";
import { startCatalogSync } from "@/server/catalog";
import { pool } from "@/shared/infrastructure/db";
import { startPerfSampler } from "@/shared/infrastructure/perfLog";
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

/** Ждать, пока в базе будут все миграции релиза (не дольше 10 минут — потом стартуем всё равно). */
export async function waitForMigrations() {
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

/** Настройка процесса: память sharp и замеры памяти (своя и всех процессов PM2 — в журнал раз в 5 минут). */
export async function prepareWorker() {
  await configureSharpMemory();
  startPerfSampler({ pm2: true });
}

/** Запустить фон: синхронизация каталога, планировщик, outbox, бот, сверки; видео, ждавшие обработки, — сразу. */
export async function startWorkerJobs() {
  startCatalogSync();
  await startBackground({ answerFilesDelayMs: 5_000 });
}
