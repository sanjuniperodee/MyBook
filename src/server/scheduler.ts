import "server-only";
import type { PoolClient } from "pg";
import { pool } from "@/shared/infrastructure/db";
import { container } from "@/server/container";

const INTERVAL_MS = 15 * 60_000;
/** Номер advisory-блокировки: при нескольких инстансах проход выполняет только один. */
const LOCK_ID = 7_310_451;

/**
 * Шаг фонового прохода: ошибка шага пишется в лог с его именем и не обрывает проход — следующие шаги выполняются.
 * Без этого сбой одного шага (правила CRM, база при перезапуске) останавливал напоминания, круг заявок, бота, почту
 * и выдачу доступа по оплаченным счетам до следующей минуты — и так каждую минуту, пока сбой не уйдёт.
 */
async function step<T>(name: string, run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch (err) {
    console.error(`[scheduler] step "${name}" failed`, err);
    return fallback;
  }
}

/** Медленный проход (раз в 15 минут): сертификаты, автописьма, чистка outbox, история WhatsApp, ночной разбор бота. Экспорт — для тестов. */
export async function tick() {
  // Блокировка живёт в сессии, поэтому держим одно соединение на весь проход.
  const client = await pool.connect();
  let locked = false;
  try {
    const { rows } = await client.query<{ locked: boolean }>("select pg_try_advisory_lock($1) as locked", [LOCK_ID]);
    locked = !!rows[0]?.locked;
    if (!locked) return;
    const gifts = await step("gifts", () => container().ordering.deliverDueGifts(), 0);
    const emails = await step("lifecycle emails", () => container().notifications.lifecycle.run(), 0);
    if (gifts || emails) console.log(`[scheduler] sent gifts=${gifts} lifecycle=${emails}`);
    await step("outbox purge", () => container().outbox.purge(), undefined);
    // История WhatsApp из своего шлюза: WhatsApp догружает старые сообщения связанному устройству постепенно.
    const history = await step("whatsapp history", () => container().messaging.syncGowaHistory(), 0);
    if (history) console.log(`[scheduler] whatsapp history imported=${history}`);
    // Работа над ошибками AI-продажника: раз в сутки ночью разбор бесед за день → уроки в его инструкции.
    const coach = await step("bot coach", () => container().messaging.coach.run(), null);
    if (coach) console.log(`[scheduler] bot coach reviewed=${coach.reviewed} added=${coach.added.length} removed=${coach.removed.length}${coach.error ? ` error=${coach.error}` : ""}`);
  } catch (err) {
    console.error("[scheduler] tick failed", err);
  } finally {
    if (locked) await client.query("select pg_advisory_unlock($1)", [LOCK_ID]).catch(() => {});
    client.release();
  }
}

/** Быстрый проход CRM раз в минуту: правила «клиенту не ответили N минут», круг заявок, почта, доступ по оплаченным счетам, кассир Kaspi. */
const CRM_INTERVAL_MS = 60_000;
const CRM_LOCK_ID = 7_310_452;

/** Экспорт — для тестов: каждый шаг выполняется, даже если предыдущий упал. */
export async function crmTick() {
  const client = await pool.connect();
  let locked = false;
  try {
    const { rows } = await client.query<{ locked: boolean }>("select pg_try_advisory_lock($1) as locked", [CRM_LOCK_ID]);
    locked = !!rows[0]?.locked;
    if (!locked) return;
    const fired = await step("crm automations", () => container().automation.engine.runScheduled(), 0);
    if (fired) console.log(`[scheduler] crm automations fired=${fired}`);
    // Напоминания о задачах: ответственному — в CRM со звуком и в WhatsApp.
    const reminded = await step("task reminders", () => container().clients.tasks.remindDue(), 0);
    if (reminded) console.log(`[scheduler] task reminders=${reminded}`);
    // Круг: ночные заявки — утром первым на смене, не взятые вовремя — следующему.
    const routed = await step("lead routing", () => container().sales.routing.run(), 0);
    if (routed) console.log(`[scheduler] crm leads routed=${routed}`);
    // Бот-квалификатор: ходы, не сделанные таймером (перезапуск процесса), ожидание менеджера, брошенные опросы.
    const botTurns = await step("bot", () => container().messaging.bot.sweep(), 0);
    if (botTurns) console.log(`[scheduler] crm bot turns=${botTurns}`);
    // Входящие письма по IMAP (если ящик подключён в «Интеграциях»).
    const mails = await step("imap", () => container().messaging.email.pollImap(), 0);
    if (mails) console.log(`[scheduler] crm emails=${mails}`);
    // Счета из чата: доступ в кабинет после оплаты (клиент, привязка, сообщение в чат; доставка) и истечение срока.
    const access = await step("invoice access", () => container().invoiceAccess.run(), { processed: 0, failed: 0 });
    if (access.processed || access.failed) console.log(`[scheduler] invoice access processed=${access.processed} failed=${access.failed}`);
    const expired = await step("invoice expiry", () => container().invoiceAccess.expire(), 0);
    if (expired) console.log(`[scheduler] invoices expired=${expired}`);
    // Кассир Kaspi: запрос к Kaspi раз в 3 минуты, руководителям — только смена состояния («отключён» / «снова подключён»).
    // Здесь, а не в сверке платежей: та выходит, пока нет сессии, и пропускает ход, когда занята пятисекундная сверка.
    const kaspi = await step("kaspi watch", () => container().ordering.kaspiWatch.check(), null);
    if (kaspi) console.warn(`[scheduler] kaspi cashier ${kaspi === "down" ? "disconnected" : "reconnected"}`);
  } catch (err) {
    console.error("[scheduler] crm tick failed", err);
  } finally {
    if (locked) await client.query("select pg_advisory_unlock($1)", [CRM_LOCK_ID]).catch(() => {});
    client.release();
  }
}

/**
 * Сверка WhatsApp со своим шлюзом (GOWA): шлюз отдаёт событие сайту 30 секунд и бросает, поэтому каждые 30 секунд
 * сверяем его хранилище с CRM — сообщение, пришедшее во время перезапуска сайта, догоняет обычным путём (заявка,
 * уведомление со звуком, бот). Ошибку «шлюз недоступен» пишем в лог один раз, а не каждые 30 секунд.
 */
const GOWA_CATCHUP_MS = 30_000;
const GOWA_CATCHUP_LOCK_ID = 7_310_480;
let gowaCatchUpError = "";

async function gowaCatchUpTick() {
  const client = await pool.connect();
  let locked = false;
  try {
    const { rows } = await client.query<{ locked: boolean }>("select pg_try_advisory_lock($1) as locked", [GOWA_CATCHUP_LOCK_ID]);
    locked = !!rows[0]?.locked;
    if (!locked) return;
    const caught = await container().messaging.catchUpGowa();
    if (caught) console.warn(`[scheduler] whatsapp: ${caught} message(s) missed by the GOWA webhook were caught up`);
    gowaCatchUpError = "";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message !== gowaCatchUpError) console.error("[scheduler] whatsapp catch-up", err);
    gowaCatchUpError = message;
  } finally {
    if (locked) await client.query("select pg_advisory_unlock($1)", [GOWA_CATCHUP_LOCK_ID]).catch(() => {});
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
  setInterval(() => void gowaCatchUpTick(), GOWA_CATCHUP_MS).unref?.();
  setInterval(() => void outboxTick(), OUTBOX_INTERVAL_MS).unref?.();
  setInterval(() => void paymentsTick(PAYMENTS_FAST_WINDOW_MS), PAYMENTS_FAST_MS).unref?.();
  setInterval(() => void paymentsTick(PAYMENTS_SLOW_WINDOW_MS), PAYMENTS_SLOW_MS).unref?.();
  setInterval(() => void dealInvoicesKaspiTick(), DEAL_KASPI_MS).unref?.();
}
