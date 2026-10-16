import "server-only";
import type { PoolClient } from "pg";
import { pool } from "@/shared/infrastructure/db";
import { container } from "@/server/container";

const INTERVAL_MS = 15 * 60_000;
/** Номер advisory-блокировки: при нескольких инстансах проход выполняет только один. */
const LOCK_ID = 7_310_451;

async function tick() {
  // Блокировка живёт в сессии, поэтому держим одно соединение на весь проход.
  const client = await pool.connect();
  let locked = false;
  try {
    const { rows } = await client.query<{ locked: boolean }>("select pg_try_advisory_lock($1) as locked", [LOCK_ID]);
    locked = !!rows[0]?.locked;
    if (!locked) return;
    const gifts = await container().ordering.deliverDueGifts();
    const emails = await container().notifications.lifecycle.run();
    if (gifts || emails) console.log(`[scheduler] sent gifts=${gifts} lifecycle=${emails}`);
    await container().outbox.purge();
    // История WhatsApp из своего шлюза: WhatsApp догружает старые сообщения связанному устройству постепенно.
    const history = await container().messaging.syncGowaHistory().catch((err) => (console.error("[scheduler] whatsapp history", err), 0));
    if (history) console.log(`[scheduler] whatsapp history imported=${history}`);
  } catch (err) {
    console.error("[scheduler] tick failed", err);
  } finally {
    if (locked) await client.query("select pg_advisory_unlock($1)", [LOCK_ID]).catch(() => {});
    client.release();
  }
}

/** Быстрый проход CRM раз в минуту: правила «клиенту не ответили N минут», круг заявок, почта, доступ по оплаченным счетам. */
const CRM_INTERVAL_MS = 60_000;
const CRM_LOCK_ID = 7_310_452;

async function crmTick() {
  const client = await pool.connect();
  let locked = false;
  try {
    const { rows } = await client.query<{ locked: boolean }>("select pg_try_advisory_lock($1) as locked", [CRM_LOCK_ID]);
    locked = !!rows[0]?.locked;
    if (!locked) return;
    const fired = await container().automation.engine.runScheduled();
    if (fired) console.log(`[scheduler] crm automations fired=${fired}`);
    // Круг: ночные заявки — утром первым на смене, не взятые вовремя — следующему.
    const routed = await container().sales.routing.run();
    if (routed) console.log(`[scheduler] crm leads routed=${routed}`);
    // Входящие письма по IMAP (если ящик подключён в «Интеграциях»).
    const mails = await container().messaging.email.pollImap();
    if (mails) console.log(`[scheduler] crm emails=${mails}`);
    // Счета из чата: доступ в кабинет после оплаты (клиент, привязка, сообщение в чат; доставка) и истечение срока.
    const access = await container()
      .invoiceAccess.run()
      .catch((err) => (console.error("[scheduler] invoice access", err), { processed: 0, failed: 0 }));
    if (access.processed || access.failed) console.log(`[scheduler] invoice access processed=${access.processed} failed=${access.failed}`);
    const expired = await container()
      .invoiceAccess.expire()
      .catch((err) => (console.error("[scheduler] invoice expiry", err), 0));
    if (expired) console.log(`[scheduler] invoices expired=${expired}`);
  } catch (err) {
    console.error("[scheduler] crm tick failed", err);
  } finally {
    if (locked) await client.query("select pg_advisory_unlock($1)", [CRM_LOCK_ID]).catch(() => {});
    client.release();
  }
}

/** Воркер outbox: повторная доставка доменных событий (после сбоя подписчика или рестарта процесса). */
const OUTBOX_INTERVAL_MS = 15_000;
let outboxBusy = false;

async function outboxTick() {
  if (outboxBusy) return 0;
  outboxBusy = true;
  try {
    let total = 0;
    for (let n = await container().outbox.dispatch(); n > 0 && total < 500; n = await container().outbox.dispatch()) total += n;
    return total;
  } catch (err) {
    console.error("[scheduler] outbox tick failed", err);
    return 0;
  } finally {
    outboxBusy = false;
  }
}

/**
 * Сверка счетов Kaspi Pay: горячий проход по счетам последних 20 минут (клиент платит прямо сейчас — заказ
 * подтверждается за секунды, даже если вебхук не дошёл) и редкий — по хвосту за трое суток (поздние подтверждения).
 */
const PAYMENTS_FAST_MS = 5_000;
const PAYMENTS_FAST_WINDOW_MS = 20 * 60_000;
const PAYMENTS_SLOW_MS = 3 * 60_000;
const PAYMENTS_SLOW_WINDOW_MS = 72 * 3600_000;
const PAYMENTS_LOCK_ID = 7_310_453;
let paymentsBusy = false;

async function paymentsTick(windowMs: number) {
  if (paymentsBusy) return;
  paymentsBusy = true;
  let client: PoolClient | null = null;
  let locked = false;
  try {
    // Kaspi не подключён — соединение с базой не занимаем.
    if (!(await container().ordering.kaspi.available())) return;
    const conn = await pool.connect();
    client = conn;
    const { rows } = await conn.query<{ locked: boolean }>("select pg_try_advisory_lock($1) as locked", [PAYMENTS_LOCK_ID]);
    locked = !!rows[0]?.locked;
    if (!locked) return;
    const { paid } = await container().ordering.kaspi.reconcile(windowMs);
    if (paid) console.log(`[scheduler] kaspi payments confirmed=${paid}`);
  } catch (err) {
    console.error("[scheduler] payments tick failed", err);
  } finally {
    if (locked) await client?.query("select pg_advisory_unlock($1)", [PAYMENTS_LOCK_ID]).catch(() => {});
    client?.release();
    paymentsBusy = false;
  }
}

/**
 * Долгая сверка Kaspi по счетам из чата (весь срок счёта — 7 дней, с запасом 8): поздние оплаты и отмена попыток по
 * закрытым счетам. Свой флаг и своя блокировка — долгий проход не задерживает быструю сверку заказов.
 */
const DEAL_KASPI_MS = 15 * 60_000;
const DEAL_KASPI_WINDOW_MS = 8 * 86_400_000;
const DEAL_KASPI_LOCK_ID = 7_310_470;
let dealKaspiBusy = false;

async function dealInvoicesKaspiTick() {
  if (dealKaspiBusy) return;
  dealKaspiBusy = true;
  let client: PoolClient | null = null;
  let locked = false;
  try {
    if (!(await container().ordering.kaspi.available())) return;
    const conn = await pool.connect();
    client = conn;
    const { rows } = await conn.query<{ locked: boolean }>("select pg_try_advisory_lock($1) as locked", [DEAL_KASPI_LOCK_ID]);
    locked = !!rows[0]?.locked;
    if (!locked) return;
    const { paid, closed } = await container().ordering.kaspi.reconcileDealInvoices(DEAL_KASPI_WINDOW_MS);
    if (paid || closed) console.log(`[scheduler] kaspi deal invoices paid=${paid} closed=${closed}`);
  } catch (err) {
    console.error("[scheduler] deal invoices kaspi tick failed", err);
  } finally {
    if (locked) await client?.query("select pg_advisory_unlock($1)", [DEAL_KASPI_LOCK_ID]).catch(() => {});
    client?.release();
    dealKaspiBusy = false;
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
  setInterval(() => void outboxTick(), OUTBOX_INTERVAL_MS).unref?.();
  setInterval(() => void paymentsTick(PAYMENTS_FAST_WINDOW_MS), PAYMENTS_FAST_MS).unref?.();
  setInterval(() => void paymentsTick(PAYMENTS_SLOW_WINDOW_MS), PAYMENTS_SLOW_MS).unref?.();
  setInterval(() => void dealInvoicesKaspiTick(), DEAL_KASPI_MS).unref?.();
}
