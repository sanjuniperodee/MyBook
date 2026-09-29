import "server-only";
import { pool } from "./db";
import { sendDueGifts } from "./gifts";
import { runLifecycle } from "./lifecycle";

const INTERVAL_MS = 15 * 60_000;
/** Номер advisory-блокировки: при нескольких инстансах проход выполняет только один. */
const LOCK_ID = 7_310_451;

export async function tick() {
  // Блокировка живёт в сессии, поэтому держим одно соединение на весь проход.
  const client = await pool.connect();
  let locked = false;
  try {
    const { rows } = await client.query<{ locked: boolean }>("select pg_try_advisory_lock($1) as locked", [LOCK_ID]);
    locked = !!rows[0]?.locked;
    if (!locked) return;
    const gifts = await sendDueGifts();
    const emails = await runLifecycle();
    if (gifts || emails) console.log(`[scheduler] sent gifts=${gifts} lifecycle=${emails}`);
  } catch (err) {
    console.error("[scheduler] tick failed", err);
  } finally {
    if (locked) await client.query("select pg_advisory_unlock($1)", [LOCK_ID]).catch(() => {});
    client.release();
  }
}

let started = false;

/** Фоновые задачи: отложенные сертификаты и автоматические письма. Отключается SCHEDULER=off. */
export function startScheduler() {
  if (started || process.env.SCHEDULER === "off") return;
  started = true;
  setTimeout(() => void tick(), 60_000).unref?.();
  setInterval(() => void tick(), INTERVAL_MS).unref?.();
}
