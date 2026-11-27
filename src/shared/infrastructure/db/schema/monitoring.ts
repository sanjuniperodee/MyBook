/** Таблицы наблюдаемости фона (модуль monitoring): пульс заданий и состояние оповещений о сбоях. */
import { sql } from "drizzle-orm";
import { bigint, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Пульс фонового задания: одна строка на задание (проход планировщика, его шаг, сверка Kaspi, сборка файлов для печати).
 * Задание пишет время начала и конца и итог; по строке видно, жив ли фон и что сломалось. Строк — десятки, обновление —
 * по первичному ключу. Подписи и интервалы — shared/domain/opsHealth.ts (OPS_JOBS).
 */
export const jobPulses = pgTable("job_pulses", {
  job: text("job").primaryKey(),
  /** Как часто задание должно идти, секунд; null — по событию. */
  everySec: integer("every_sec"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  /** Итог последнего прохода: ok, error или off (задание выключено — Kaspi не подключён). */
  outcome: text("outcome", { enum: ["ok", "error", "off"] }),
  durationMs: integer("duration_ms"),
  /** Последний удачный проход. */
  okAt: timestamp("ok_at", { withTimezone: true }),
  /** Последняя ошибка и когда была (остаются и после удачных проходов). */
  error: text("error"),
  errorAt: timestamp("error_at", { withTimezone: true }),
  /** Ошибок подряд (удачный проход обнуляет). */
  fails: integer("fails").notNull().default(0),
  runs: bigint("runs", { mode: "number" }).notNull().default(0),
  failures: bigint("failures", { mode: "number" }).notNull().default(0),
  /** Короткий итог прохода (например, номер заказа). */
  note: text("note"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});

/** Оповещение о потоке в сбое: с какого момента поток красный и когда руководителям последний раз сообщили. */
export const opsAlerts = pgTable("ops_alerts", {
  stream: text("stream").primaryKey(),
  downSince: timestamp("down_since", { withTimezone: true }),
  notifiedAt: timestamp("notified_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});
