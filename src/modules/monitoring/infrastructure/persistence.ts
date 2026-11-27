import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/shared/infrastructure/db";
import { jobPulses, opsAlerts } from "@/shared/infrastructure/db/schema";
import { OPS_THRESHOLDS } from "@/shared/domain/opsHealth";
import type { PulseRow } from "../domain/health";
import type { OpsAlertStore, OpsFactsReader, PulseRecord, PulseStore } from "../application/ports";

const asDate = (v: unknown): Date | null => (v == null ? null : v instanceof Date ? v : new Date(String(v)));
const num = (v: unknown) => Number(v ?? 0) || 0;

/** Пульсы в job_pulses: upsert по первичному ключу, счётчики и «ошибок подряд» считает база. */
export const drizzlePulseStore: PulseStore = {
  async start(job, everySec, at) {
    await db
      .insert(jobPulses)
      .values({ job, everySec, startedAt: at })
      .onConflictDoUpdate({ target: jobPulses.job, set: { startedAt: at, everySec, updatedAt: sql`now()` } });
  },

  async finish(records: PulseRecord[]) {
    if (!records.length) return;
    // Один и тот же шаг дважды в пачке быть не должен, но upsert с повтором ключа упал бы — оставляем последний.
    const byJob = new Map(records.map((r) => [r.job, r]));
    const values = [...byJob.values()].map((r) => {
      const failed = r.outcome === "error";
      return {
        job: r.job,
        everySec: r.everySec,
        startedAt: r.startedAt,
        finishedAt: r.finishedAt,
        outcome: r.outcome,
        durationMs: Math.max(0, r.finishedAt.getTime() - r.startedAt.getTime()),
        okAt: failed ? null : r.finishedAt,
        error: failed ? r.error : null,
        errorAt: failed ? r.finishedAt : null,
        fails: failed ? 1 : 0,
        runs: 1,
        failures: failed ? 1 : 0,
        note: r.note,
      };
    });
    await db
      .insert(jobPulses)
      .values(values)
      .onConflictDoUpdate({
        target: jobPulses.job,
        set: {
          everySec: sql`excluded.every_sec`,
          startedAt: sql`excluded.started_at`,
          finishedAt: sql`excluded.finished_at`,
          outcome: sql`excluded.outcome`,
          durationMs: sql`excluded.duration_ms`,
          okAt: sql`coalesce(excluded.ok_at, ${jobPulses.okAt})`,
          error: sql`coalesce(excluded.error, ${jobPulses.error})`,
          errorAt: sql`coalesce(excluded.error_at, ${jobPulses.errorAt})`,
          fails: sql`case when excluded.outcome = 'error' then ${jobPulses.fails} + 1 else 0 end`,
          runs: sql`${jobPulses.runs} + 1`,
          failures: sql`${jobPulses.failures} + excluded.failures`,
          note: sql`excluded.note`,
          updatedAt: sql`now()`,
        },
      });
  },

  async all(): Promise<PulseRow[]> {
    const rows = await db.select().from(jobPulses);
    return rows.map((r) => ({
      job: r.job,
      everySec: r.everySec,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      outcome: r.outcome,
      durationMs: r.durationMs,
      okAt: r.okAt,
      error: r.error,
      errorAt: r.errorAt,
      fails: r.fails,
      runs: r.runs,
      failures: r.failures,
      note: r.note,
    }));
  },
};

/**
 * Агрегаты очередей. Каждый запрос идёт по индексу: outbox — частичный по недоставленным (outbox_unprocessed_idx) и
 * (processed_at, available_at); сообщения — частичные по ошибкам, «отправляется» и голосовым без расшифровки; видео —
 * (status, created_at); автописьма — таблица на десятки строк.
 */
export const drizzleOpsFacts: OpsFactsReader = {
  async facts(now, opts) {
    const hourAgo = new Date(now.getTime() - 3_600_000);
    const dayAgo = new Date(now.getTime() - OPS_THRESHOLDS.daySec * 1000);
    const pendingBefore = new Date(now.getTime() - OPS_THRESHOLDS.messagePendingSec * 1000);
    const [outbox, outboxLast, delivered, msg, msgLast, voices, media, mediaLast, mail] = await Promise.all([
      db.execute<{ pending: number; due_oldest: unknown; retrying: number; dead: number; dead_last: unknown }>(sql`
        select count(*) filter (where failed_at is null)::int as pending,
               min(created_at) filter (where failed_at is null and available_at <= ${now} and (locked_until is null or locked_until <= ${now})) as due_oldest,
               count(*) filter (where failed_at is null and attempts > 0)::int as retrying,
               count(*) filter (where failed_at is not null)::int as dead,
               max(failed_at) as dead_last
        from outbox_events where processed_at is null`),
      db.execute<{ kind: string; type: string; last_error: string | null }>(sql`
        (select 'dead' as kind, type, last_error from outbox_events where processed_at is null and failed_at is not null order by failed_at desc limit 1)
        union all
        (select 'retry' as kind, type, last_error from outbox_events where processed_at is null and failed_at is null and attempts > 0 order by created_at desc limit 1)`),
      db.execute<{ n: number }>(sql`select count(*)::int as n from outbox_events where processed_at >= ${hourAgo}`),
      db.execute<{ hour: number; day: number; last_at: unknown }>(sql`
        select count(*) filter (where created_at >= ${hourAgo})::int as hour, count(*)::int as day, max(created_at) as last_at
        from crm_messages where status = 'error' and created_at >= ${dayAgo}`),
      db.execute<{ error: string | null; stuck: number }>(sql`
        select (select error from crm_messages where status = 'error' and created_at >= ${dayAgo} order by created_at desc limit 1) as error,
               (select count(*)::int from crm_messages where status = 'pending' and direction = 'out' and created_at >= ${dayAgo} and created_at < ${pendingBefore}) as stuck`),
      opts.voices
        ? db.execute<{ n: number; oldest: unknown }>(sql`
            select count(*)::int as n, min(created_at) as oldest from crm_messages
            where type = 'audio' and transcript is null and deleted_at is null and created_at >= ${new Date(now.getTime() - 3 * 86_400_000)}`)
        : null,
      db.execute<{ queued: number; oldest: unknown; failed: number }>(sql`
        select count(*) filter (where status in ('queued', 'processing'))::int as queued,
               min(created_at) filter (where status in ('queued', 'processing')) as oldest,
               count(*) filter (where status = 'failed' and created_at >= ${dayAgo})::int as failed
        from answer_files where status in ('queued', 'processing') or (status = 'failed' and created_at >= ${dayAgo})`),
      db.execute<{ error: string | null }>(sql`select error from answer_files where status = 'failed' and created_at >= ${dayAgo} order by created_at desc limit 1`),
      db.execute<{ n: number; last_at: unknown }>(sql`select count(*) filter (where sent_at >= ${dayAgo})::int as n, max(sent_at) as last_at from email_log`),
    ]);
    const o = outbox.rows[0];
    const dead = outboxLast.rows.find((r) => r.kind === "dead");
    const retry = outboxLast.rows.find((r) => r.kind === "retry");
    const m = msg.rows[0];
    const v = voices?.rows[0];
    const a = media.rows[0];
    return {
      outbox: {
        pending: num(o?.pending),
        dueOldestAt: asDate(o?.due_oldest),
        retrying: num(o?.retrying),
        retryError: retry ? [retry.type, retry.last_error].filter(Boolean).join(": ") : null,
        dead: num(o?.dead),
        deadLastAt: asDate(o?.dead_last),
        deadLastType: dead?.type ?? null,
        deadLastError: dead?.last_error ?? null,
        deliveredHour: num(delivered.rows[0]?.n),
      },
      messages: { errorsHour: num(m?.hour), errorsDay: num(m?.day), lastErrorAt: asDate(m?.last_at), lastError: msgLast.rows[0]?.error ?? null, pendingStuck: num(msgLast.rows[0]?.stuck) },
      voices: v ? { waiting: num(v.n), oldestAt: asDate(v.oldest) } : null,
      media: { queued: num(a?.queued), oldestAt: asDate(a?.oldest), failedDay: num(a?.failed), lastFailedError: mediaLast.rows[0]?.error ?? null },
      mail: { sentDay: num(mail.rows[0]?.n), lastSentAt: asDate(mail.rows[0]?.last_at) },
    };
  },
};

export const drizzleOpsAlerts: OpsAlertStore = {
  async all() {
    const rows = await db.select().from(opsAlerts);
    return new Map(rows.map((r) => [r.stream, { downSince: r.downSince, notifiedAt: r.notifiedAt }]));
  },
  async save(stream, state) {
    await db
      .insert(opsAlerts)
      .values({ stream, ...state })
      .onConflictDoUpdate({ target: opsAlerts.stream, set: { downSince: state.downSince, notifiedAt: state.notifiedAt, updatedAt: sql`now()` } });
  },
};
