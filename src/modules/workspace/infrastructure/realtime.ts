import "server-only";
import type { PoolClient } from "pg";
import { pool } from "@/shared/infrastructure/db";
import type { LiveEvent, LiveFeed } from "@/shared/application";

export type { LiveEvent };

/*
 * Мгновенные обновления CRM: события идут через PostgreSQL LISTEN/NOTIFY, поэтому работают
 * и при нескольких процессах приложения. Браузер получает их по SSE (/api/admin/live/stream).
 */

const CHANNEL = "crm_live";
type Bus = { subs: Set<(e: LiveEvent) => void>; client: PoolClient | null; starting: Promise<void> | null; retry?: ReturnType<typeof setTimeout> | null; attempt?: number };
const g = globalThis as unknown as { __crmBus?: Bus };
const bus: Bus = (g.__crmBus ??= { subs: new Set(), client: null, starting: null });

/**
 * Слушатель пропал (база перезапустилась, соединение оборвалось, не подключились) — снова, с паузой 1, 2, 4… до 30 с,
 * пока кто-то слушает. Без этого живые обновления молча пропадали до перезапуска сайта.
 */
function reconnectLater() {
  if (!bus.subs.size || bus.retry) return;
  const attempt = bus.attempt ?? 0;
  bus.attempt = attempt + 1;
  bus.retry = setTimeout(() => {
    bus.retry = null;
    void ensureListener();
  }, Math.min(30_000, 1000 * 2 ** attempt));
}

async function ensureListener() {
  if (bus.client) return;
  bus.starting ??= (async () => {
    let client: PoolClient | null = null;
    try {
      client = await pool.connect();
      const conn = client;
      await conn.query(`LISTEN ${CHANNEL}`);
      conn.on("notification", (msg) => {
        if (msg.channel !== CHANNEL || !msg.payload) return;
        let e: LiveEvent;
        try {
          e = JSON.parse(msg.payload) as LiveEvent;
        } catch {
          return;
        }
        for (const fn of bus.subs) fn(e);
      });
      // «error» и «end» приходят оба — соединение освобождаем и переподключаемся один раз.
      let gone = false;
      const reset = () => {
        if (gone) return;
        gone = true;
        if (bus.client === conn) bus.client = null;
        try {
          conn.release(true);
        } catch {
          // уже освобождено
        }
        reconnectLater();
      };
      conn.on("error", reset);
      conn.on("end", reset);
      bus.client = conn;
      bus.attempt = 0;
    } catch (err) {
      console.error("[realtime] listen failed", err);
      client?.release(true);
      reconnectLater();
    } finally {
      bus.starting = null;
    }
  })();
  await bus.starting;
}

export async function subscribe(fn: (e: LiveEvent) => void) {
  bus.subs.add(fn);
  await ensureListener();
  return () => {
    bus.subs.delete(fn);
  };
}

/** Разослать событие всем процессам. Ошибка публикации не ломает основное действие. */
export async function publish(e: LiveEvent) {
  try {
    await pool.query("select pg_notify($1, $2)", [CHANNEL, JSON.stringify(e).slice(0, 7000)]);
  } catch (err) {
    console.error("[realtime] publish", err);
  }
}

/** Порт живого обновления для других модулей (src/shared/application). */
export const liveFeed: LiveFeed = { publish };
