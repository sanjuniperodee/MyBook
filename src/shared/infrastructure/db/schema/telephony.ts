/** Звонки из АТС (модуль telephony). */
import { sql } from "drizzle-orm";
import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./identity";
import { crmDeals } from "./sales";

/** Звонок из АТС. */
export const crmCalls = pgTable(
  "crm_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    externalId: text("external_id").notNull(),
    direction: text("direction", { enum: ["in", "out"] }).notNull(),
    /** Номер клиента (нормализованный, только цифры). */
    clientPhone: text("client_phone").notNull().default(""),
    /** Внутренний номер сотрудника, если известен. */
    extension: text("extension"),
    staffId: uuid("staff_id").references(() => users.id, { onDelete: "set null" }),
    clientId: uuid("client_id").references(() => users.id, { onDelete: "set null" }),
    dealId: uuid("deal_id").references(() => crmDeals.id, { onDelete: "set null" }),
    status: text("status", { enum: ["ringing", "answered", "missed", "busy", "failed"] }).notNull().default("ringing"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    durationSec: integer("duration_sec").notNull().default(0),
    /** Есть ли запись у провайдера (ссылку запрашиваем по требованию — она временная). */
    hasRecording: boolean("has_recording").notNull().default(false),
    recordingRef: text("recording_ref"),
    /** Звонок обработан (перезвонили / закрыли задачу) — для пропущенных. */
    handledAt: timestamp("handled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("crm_calls_ext_idx").on(t.provider, t.externalId),
    index("crm_calls_started_idx").on(t.startedAt),
    index("crm_calls_phone_idx").on(t.clientPhone),
    // Звонки сделки: последняя активность по сделке (правило «Сделка без активности»).
    index("crm_calls_deal_idx").on(t.dealId).where(sql`${t.dealId} is not null`),
  ],
);
