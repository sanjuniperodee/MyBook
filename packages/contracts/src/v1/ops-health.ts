/**
 * API v1 — «Фон и очереди» (CRM → Настройки → Система): жив ли фон и не застряло ли что-нибудь. Потоки, их уровни,
 * цифры, сигналы и задания с пульсом. Подписи и пороги — shared/domain/opsHealth.ts (сервер отдаёт готовые подписи).
 */
import { z } from "zod";
import { iso, route, schemas, type RouteDef } from "./core";

export const OpsLevel = z.enum(["ok", "warn", "down", "off"]).register(schemas, { id: "OpsLevel" });

export const OpsSignal = z
  .object({
    level: z.enum(["warn", "down"]),
    text: z.string(),
    /** Повод уведомить руководителей (у кассира Kaspi своё уведомление, у шагов стоящего прохода — в «Планировщике»). */
    alert: z.boolean(),
  })
  .register(schemas, { id: "OpsSignal" });

export const OpsMetric = z
  .object({
    key: z.string(),
    label: z.string(),
    /** count — штуки, age — секунды, time — момент (ISO), text — текст. */
    unit: z.enum(["count", "age", "time", "text"]),
    value: z.union([z.number(), z.string()]).nullable(),
    level: OpsLevel,
  })
  .register(schemas, { id: "OpsMetric" });

export const OpsJob = z
  .object({
    key: z.string(),
    label: z.string(),
    level: OpsLevel,
    /** Как часто идёт, секунд; null — по событию. */
    every: z.number().int().nullable(),
    startedAt: iso.nullable(),
    finishedAt: iso.nullable(),
    /** Последний удачный проход. */
    okAt: iso.nullable(),
    /** Идёт сейчас (начался после последнего конца). */
    running: z.boolean(),
    outcome: z.enum(["ok", "error", "off"]).nullable(),
    durationMs: z.number().int().nullable(),
    /** Ошибок подряд. */
    fails: z.number().int(),
    runs: z.number().int(),
    failures: z.number().int(),
    error: z.string().nullable(),
    errorAt: iso.nullable(),
    note: z.string().nullable(),
  })
  .register(schemas, { id: "OpsJob" });

export const OpsStream = z
  .object({
    key: z.enum(["worker", "outbox", "kaspi", "whatsapp", "ai", "media", "mail", "print"]),
    title: z.string(),
    hint: z.string(),
    level: OpsLevel,
    lastOkAt: iso.nullable(),
    metrics: z.array(OpsMetric),
    signals: z.array(OpsSignal),
    /** Пояснения без тревоги («автописьма выключены»). */
    notes: z.array(z.string()),
    jobs: z.array(OpsJob),
    /** Последние ошибки заданий потока, новые сверху. */
    errors: z.array(z.object({ at: iso, job: z.string(), text: z.string() })),
  })
  .register(schemas, { id: "OpsStream" });

export const OpsHealth = z
  .object({
    at: iso,
    /** Худший уровень потоков (выключенные не в счёт). */
    level: OpsLevel,
    /** Через сколько секунд спросить снова. */
    refreshSec: z.number().int(),
    streams: z.array(OpsStream),
  })
  .register(schemas, { id: "OpsHealth" });

export const opsHealthRoutes = {
  crmOpsHealth: route({
    method: "GET",
    path: "/api/v1/crm/ops/health",
    auth: "staff",
    tag: "crm",
    summary: "Фон и очереди: планировщик, outbox, Kaspi, WhatsApp, ИИ, видео, письма, файлы для печати (право settings.manage)",
    response: OpsHealth,
  }),
} satisfies Record<string, RouteDef>;
