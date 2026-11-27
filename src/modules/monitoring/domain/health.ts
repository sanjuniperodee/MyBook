/**
 * Оценка фона по фактам (пульсы заданий и агрегаты очередей): уровень каждого задания, цифры и сигналы потоков. Чистые
 * функции — пороги и подписи из shared/domain/opsHealth.ts, время — аргументом.
 */
import {
  OPS_JOBS,
  OPS_METRIC_LABEL,
  OPS_STREAMS,
  OPS_STREAM_LABEL,
  OPS_TEXT,
  OPS_THRESHOLDS as T,
  isOpsJob,
  opsAge,
  opsStaleAfter,
  opsText,
  worseLevel,
  worstLevel,
  type OpsJob,
  type OpsJobDef,
  type OpsLevel,
  type OpsMetric,
  type OpsMetricUnit,
  type OpsStream,
} from "@/shared/domain/opsHealth";

/** Строка пульса задания (таблица job_pulses). */
export interface PulseRow {
  job: string;
  everySec: number | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  outcome: "ok" | "error" | "off" | null;
  durationMs: number | null;
  okAt: Date | null;
  error: string | null;
  errorAt: Date | null;
  fails: number;
  runs: number;
  failures: number;
  note: string | null;
}

/** Состояние кассира Kaspi из настройки kaspi.watch (его ведёт KaspiWatchService). */
export interface CashierState {
  ok: boolean;
  since: Date;
  reason: string | null;
  alerted: boolean;
}

/** Всё, что посчитано для сводки: пульсы и агрегаты по индексам. */
export interface OpsFacts {
  pulses: PulseRow[];
  outbox: {
    pending: number;
    /** Самое старое событие, срок доставки которого уже наступил (не ждёт паузы повтора). */
    dueOldestAt: Date | null;
    retrying: number;
    retryError: string | null;
    dead: number;
    deadLastAt: Date | null;
    deadLastType: string | null;
    deadLastError: string | null;
    deliveredHour: number;
  };
  messages: { errorsHour: number; errorsDay: number; lastErrorAt: Date | null; lastError: string | null; pendingStuck: number };
  voices: { waiting: number; oldestAt: Date | null } | null;
  media: { queued: number; oldestAt: Date | null; failedDay: number; lastFailedError: string | null };
  mail: { sentDay: number; lastSentAt: Date | null; autoOn: boolean };
  cashier: CashierState | null;
}

export interface OpsSignal {
  level: "warn" | "down";
  text: string;
  /** Повод уведомить руководителей (у кассира Kaspi своё уведомление, у шагов — общее в «Планировщике»). */
  alert: boolean;
}

export interface OpsJobView {
  key: string;
  label: string;
  level: OpsLevel;
  every: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  okAt: string | null;
  running: boolean;
  outcome: "ok" | "error" | "off" | null;
  durationMs: number | null;
  fails: number;
  runs: number;
  failures: number;
  error: string | null;
  errorAt: string | null;
  note: string | null;
}

export interface OpsMetricView {
  key: OpsMetric;
  label: string;
  unit: OpsMetricUnit;
  value: number | string | null;
  level: OpsLevel;
}

export interface OpsStreamView {
  key: OpsStream;
  title: string;
  hint: string;
  level: OpsLevel;
  lastOkAt: string | null;
  metrics: OpsMetricView[];
  signals: OpsSignal[];
  notes: string[];
  jobs: OpsJobView[];
  errors: { at: string; job: string; text: string }[];
}

export interface OpsSnapshot {
  at: string;
  level: OpsLevel;
  refreshSec: number;
  streams: OpsStreamView[];
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const secSince = (d: Date, now: Date) => (now.getTime() - d.getTime()) / 1000;
const latest = (...ds: (Date | null)[]) => ds.reduce<Date | null>((a, d) => (d && (!a || d > a) ? d : a), null);

/** «Давно не было прохода»: уровень и сколько секунд с последнего начала или конца. */
export function staleness(def: Pick<OpsJobDef, "every">, row: PulseRow | undefined, now: Date): { level: OpsLevel; age: number | null } {
  if (def.every == null) return { level: "ok", age: null };
  const last = row ? latest(row.startedAt, row.finishedAt) : null;
  if (!last) return { level: "warn", age: null };
  const age = secSince(last, now);
  const after = opsStaleAfter(def.every);
  return { level: age > after.down ? "down" : age > after.warn ? "warn" : "ok", age };
}

/** Задание: уровень и сигналы (без «давно не было» у шагов — его даёт проход). */
export function evaluateJob(key: OpsJob, row: PulseRow | undefined, now: Date): { view: OpsJobView; signals: OpsSignal[] } {
  const def: OpsJobDef = OPS_JOBS[key];
  const signals: OpsSignal[] = [];
  let level: OpsLevel = row?.outcome === "off" ? "off" : "ok";
  if (!def.pass) {
    const stale = staleness(def, row, now);
    if (stale.level !== "ok") {
      level = worseLevel(level, stale.level);
      const text = stale.age == null ? opsText(OPS_TEXT.neverRan, { job: def.label }) : opsText(OPS_TEXT.stale, { job: def.label, age: opsAge(stale.age) });
      signals.push({ level: stale.level === "down" ? "down" : "warn", text, alert: true });
    }
  }
  if (row && row.fails > 0) {
    const down = row.fails >= T.failsDown;
    level = worseLevel(level, down ? "down" : "warn");
    signals.push({ level: down ? "down" : "warn", text: opsText(OPS_TEXT.fails, { job: def.label, n: row.fails, text: row.error ?? "" }), alert: true });
  } else if (row?.errorAt && row.error && secSince(row.errorAt, now) < T.recentErrorSec) {
    level = worseLevel(level, "warn");
    signals.push({ level: "warn", text: opsText(OPS_TEXT.recentError, { job: def.label, age: opsAge(secSince(row.errorAt, now)), text: row.error }), alert: false });
  }
  const running = !!row?.startedAt && (!row.finishedAt || row.startedAt > row.finishedAt);
  return {
    view: {
      key,
      label: def.label,
      level,
      every: def.every,
      startedAt: iso(row?.startedAt ?? null),
      finishedAt: iso(row?.finishedAt ?? null),
      okAt: iso(row?.okAt ?? null),
      running,
      outcome: row?.outcome ?? null,
      durationMs: row?.durationMs ?? null,
      fails: row?.fails ?? 0,
      runs: row?.runs ?? 0,
      failures: row?.failures ?? 0,
      error: row?.error ?? null,
      errorAt: iso(row?.errorAt ?? null),
      note: row?.note ?? null,
    },
    signals,
  };
}

const metric = (key: OpsMetric, unit: OpsMetricUnit, value: number | string | null, level: OpsLevel = "ok"): OpsMetricView => ({ key, label: OPS_METRIC_LABEL[key], unit, value, level });

/** Уровень по возрасту: ok / warn / down. */
const byAge = (sec: number | null, warn: number, down: number): OpsLevel => (sec == null ? "ok" : sec > down ? "down" : sec > warn ? "warn" : "ok");

/** Цифры, сигналы и пояснения потока по агрегатам очередей. */
function streamFacts(stream: OpsStream, f: OpsFacts, pulses: PulseRow[], now: Date): { metrics: OpsMetricView[]; signals: OpsSignal[]; notes: string[] } {
  const metrics: OpsMetricView[] = [];
  const signals: OpsSignal[] = [];
  const notes: string[] = [];
  const push = (level: OpsLevel, text: string, alert = true) => {
    if (level === "warn" || level === "down") signals.push({ level, text, alert });
  };
  switch (stream) {
    case "worker": {
      const seen = pulses.reduce<Date | null>((a, p) => latest(a, p.startedAt, p.finishedAt), null);
      metrics.push(metric("workerSeen", "time", iso(seen)));
      break;
    }
    case "outbox": {
      const o = f.outbox;
      const dueAge = o.dueOldestAt ? secSince(o.dueOldestAt, now) : null;
      const dueLevel = byAge(dueAge, T.outboxDueWarnSec, T.outboxDueDownSec);
      const deadLevel: OpsLevel = !o.dead ? "ok" : o.deadLastAt && secSince(o.deadLastAt, now) < T.outboxDeadDownSec ? "down" : "warn";
      metrics.push(
        metric("outboxPending", "count", o.pending),
        metric("outboxDueAge", "age", dueAge == null ? null : Math.round(dueAge), dueLevel),
        metric("outboxRetrying", "count", o.retrying, o.retrying ? "warn" : "ok"),
        metric("outboxDead", "count", o.dead, deadLevel),
        metric("outboxHour", "count", o.deliveredHour),
      );
      if (dueAge != null) push(dueLevel, opsText(OPS_TEXT.outboxDue, { age: opsAge(dueAge) }));
      if (o.retrying) push("warn", opsText(OPS_TEXT.outboxRetrying, { n: o.retrying, text: o.retryError ?? "" }), false);
      if (o.dead) push(deadLevel, opsText(OPS_TEXT.outboxDead, { n: o.dead, text: [o.deadLastType, o.deadLastError].filter(Boolean).join(": ") }));
      break;
    }
    case "kaspi": {
      const c = f.cashier;
      if (c) {
        const level: OpsLevel = c.ok ? "ok" : c.alerted ? "down" : "warn";
        metrics.push(metric("kaspiCashier", "text", c.ok ? OPS_TEXT.cashierOk : OPS_TEXT.cashierDown, level));
        // У кассира своё уведомление руководителям (KaspiWatchService) — здесь не дублируем.
        if (!c.ok) push(level, opsText(c.alerted ? OPS_TEXT.kaspiDown : OPS_TEXT.kaspiWarn, { age: opsAge(secSince(c.since, now)) }), false);
      }
      break;
    }
    case "whatsapp": {
      const m = f.messages;
      const errLevel: OpsLevel = m.errorsHour >= T.messageErrorsDown ? "down" : m.errorsHour >= T.messageErrorsWarn ? "warn" : "ok";
      const pendLevel: OpsLevel = m.pendingStuck >= T.messagePendingDown ? "down" : m.pendingStuck ? "warn" : "ok";
      metrics.push(metric("waErrorsHour", "count", m.errorsHour, errLevel), metric("waErrorsDay", "count", m.errorsDay), metric("waPending", "count", m.pendingStuck, pendLevel));
      push(errLevel, opsText(OPS_TEXT.waErrors, { n: m.errorsHour, text: m.lastError ?? "" }));
      push(pendLevel, opsText(OPS_TEXT.waPending, { n: m.pendingStuck }));
      break;
    }
    case "ai": {
      const v = f.voices;
      if (v) {
        const age = v.oldestAt ? secSince(v.oldestAt, now) : null;
        const level = byAge(age, T.voiceWaitWarnSec, T.voiceWaitDownSec);
        metrics.push(metric("voicesWaiting", "count", v.waiting, level), metric("voicesAge", "age", age == null ? null : Math.round(age), level));
        if (age != null) push(level, opsText(OPS_TEXT.voicesWait, { age: opsAge(age) }));
      }
      break;
    }
    case "media": {
      const m = f.media;
      const age = m.oldestAt ? secSince(m.oldestAt, now) : null;
      const level = byAge(age, T.mediaWaitWarnSec, T.mediaWaitDownSec);
      metrics.push(metric("mediaQueued", "count", m.queued, level), metric("mediaAge", "age", age == null ? null : Math.round(age), level), metric("mediaFailedDay", "count", m.failedDay, m.failedDay ? "warn" : "ok"));
      if (age != null) push(level, opsText(OPS_TEXT.mediaWait, { age: opsAge(age) }));
      if (m.failedDay) push("warn", opsText(OPS_TEXT.mediaFailed, { n: m.failedDay, text: m.lastFailedError ?? "" }), false);
      break;
    }
    case "mail": {
      metrics.push(metric("mailSentDay", "count", f.mail.sentDay), metric("mailLastSent", "time", iso(f.mail.lastSentAt)));
      if (!f.mail.autoOn) notes.push(OPS_TEXT.mailOff);
      break;
    }
    case "print":
      break;
  }
  return { metrics, signals, notes };
}

/** Сводка по всем потокам. */
export function evaluate(f: OpsFacts, now: Date): OpsSnapshot {
  const rows = new Map(f.pulses.filter((p) => isOpsJob(p.job)).map((p) => [p.job, p]));
  const keys = Object.keys(OPS_JOBS) as OpsJob[];
  const passStale = {
    "scheduler.slow": staleness(OPS_JOBS["scheduler.slow"], rows.get("scheduler.slow"), now).level,
    "scheduler.crm": staleness(OPS_JOBS["scheduler.crm"], rows.get("scheduler.crm"), now).level,
  };
  const streams = OPS_STREAMS.map((stream): OpsStreamView => {
    const jobs: OpsJobView[] = [];
    const signals: OpsSignal[] = [];
    for (const key of keys) {
      const def: OpsJobDef = OPS_JOBS[key];
      if (def.stream !== stream) continue;
      const { view, signals: s } = evaluateJob(key, rows.get(key), now);
      // Шаг стоящего прохода тоже стоит: уровень — как у прохода, тревога — одна, в «Планировщике».
      if (def.pass && passStale[def.pass] !== "ok" && view.level !== "off") {
        view.level = worseLevel(view.level, passStale[def.pass]);
        const text = opsText(OPS_TEXT.passStale, { job: OPS_JOBS[def.pass].label });
        if (OPS_JOBS[def.pass].stream !== stream && !signals.some((x) => x.text === text)) signals.push({ level: passStale[def.pass] === "down" ? "down" : "warn", text, alert: false });
      }
      jobs.push(view);
      signals.push(...s);
    }
    const facts = streamFacts(stream, f, f.pulses, now);
    signals.push(...facts.signals);
    const active = jobs.filter((j) => j.level !== "off");
    const level = !active.length && !facts.metrics.length ? "off" : worstLevel([...active.map((j) => j.level), ...facts.metrics.map((m) => m.level), ...signals.map((s) => s.level)]);
    const errors = jobs
      .filter((j) => j.error && j.errorAt)
      .sort((a, b) => b.errorAt!.localeCompare(a.errorAt!))
      .slice(0, 5)
      .map((j) => ({ at: j.errorAt!, job: j.label, text: j.error! }));
    const okAts = active.map((j) => j.okAt).filter((x): x is string => !!x);
    return {
      key: stream,
      ...OPS_STREAM_LABEL[stream],
      level,
      lastOkAt: okAts.sort().at(-1) ?? null,
      metrics: facts.metrics,
      signals: signals.sort((a, b) => (a.level === b.level ? 0 : a.level === "down" ? -1 : 1)),
      notes: facts.notes,
      jobs,
      errors,
    };
  });
  return { at: now.toISOString(), level: worstLevel(streams.map((s) => s.level).filter((l) => l !== "off")), refreshSec: T.refreshSec, streams };
}

/** Повод уведомить руководителей о потоке: сбой, о котором больше никто не сообщает. */
export const alertSignals = (s: OpsStreamView) => s.signals.filter((x) => x.level === "down" && x.alert);

/** Что делать с оповещением о потоке: сообщить о сбое, о восстановлении или ничего; и новое состояние. */
export function alertStep(
  prev: { downSince: Date | null; notifiedAt: Date | null } | null,
  down: boolean,
  now: Date,
): { next: { downSince: Date | null; notifiedAt: Date | null }; send: "down" | "up" | null } {
  if (!down) return { next: { downSince: null, notifiedAt: null }, send: prev?.notifiedAt ? "up" : null };
  const downSince = prev?.downSince ?? now;
  const lasted = (now.getTime() - downSince.getTime()) / 60_000;
  const quiet = prev?.notifiedAt && (now.getTime() - prev.notifiedAt.getTime()) / 60_000 < T.alertEveryMin;
  if (lasted >= T.alertAfterMin && !quiet) return { next: { downSince, notifiedAt: now }, send: "down" };
  return { next: { downSince, notifiedAt: prev?.notifiedAt ?? null }, send: null };
}
