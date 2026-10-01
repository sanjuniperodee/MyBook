import "server-only";
import type { PoolClient } from "pg";
import { pool } from "@/shared/infrastructure/db";

/**
 * Мгновенные обновления CRM: события идут через PostgreSQL LISTEN/NOTIFY, поэтому работают
 * и при нескольких процессах приложения. Браузер получает их по SSE (/api/admin/live/stream).
 */
export interface LiveEvent {
  /** notify — новое уведомление, chat — сообщение/статус в чате, call — звонок. */
  type: "notify" | "chat" | "call";
  /** Кому адресовано (для notify); без users — всем сотрудникам. */
  users?: string[];
  conversationId?: string;
}

const CHANNEL = "crm_live";
type Bus = { subs: Set<(e: LiveEvent) => void>; client: PoolClient | null; starting: Promise<void> | null };
const g = globalThis as unknown as { __crmBus?: Bus };
const bus: Bus = (g.__crmBus ??= { subs: new Set(), client: null, starting: null });

async function ensureListener() {
  if (bus.client) return;
  bus.starting ??= (async () => {
    try {
      const client = await pool.connect();
      await client.query(`LISTEN ${CHANNEL}`);
      client.on("notification", (msg) => {
        if (msg.channel !== CHANNEL || !msg.payload) return;
        let e: LiveEvent;
        try {
          e = JSON.parse(msg.payload) as LiveEvent;
        } catch {
          return;
        }
        for (const fn of bus.subs) fn(e);
      });
      const reset = () => {
        bus.client = null;
        client.release(true);
        // Переподключаемся, если ещё кто-то слушает.
        if (bus.subs.size) setTimeout(() => void ensureListener(), 3000);
      };
      client.on("error", reset);
      client.on("end", () => (bus.client = null));
      bus.client = client;
    } catch (err) {
      console.error("[realtime] listen failed", err);
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
