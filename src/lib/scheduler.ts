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

/** Быстрый проход CRM раз в минуту: правила «клиенту не ответили N минут». */
const CRM_INTERVAL_MS = 60_000;
const CRM_LOCK_ID = 7_310_452;

export async function crmTick() {
  const client = await pool.connect();
  let locked = false;
  try {
    const { rows } = await client.query<{ locked: boolean }>("select pg_try_advisory_lock($1) as locked", [CRM_LOCK_ID]);
    locked = !!rows[0]?.locked;
    if (!locked) return;
    const { runScheduledAutomations } = await import("./crm/automations");
    const fired = await runScheduledAutomations();
    if (fired) console.log(`[scheduler] crm automations fired=${fired}`);
    // Входящие письма по IMAP (если ящик подключён в «Интеграциях»).
    const { pollImap } = await import("./crm/email");
    const mails = await pollImap();
    if (mails) console.log(`[scheduler] crm emails=${mails}`);
  } catch (err) {
    console.error("[scheduler] crm tick failed", err);
  } finally {
    if (locked) await client.query("select pg_advisory_unlock($1)", [CRM_LOCK_ID]).catch(() => {});
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
  setInterval(() => void crmTick(), CRM_INTERVAL_MS).unref?.();
}
