/** Правила автоматизации CRM и журнал их срабатываний (модуль automation). */
import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "./columns";

export interface AutomationAction {
  type: "create_task" | "send_message" | "assign" | "move_stage" | "notify" | "create_deal" | "draft_message";
  title?: string;
  text?: string;
  /** Текст клиенту на казахском (клиенту с казахским языком); пусто — русский text. */
  textKk?: string;
  dueMinutes?: number;
  userId?: string | null;
  stageId?: string;
}

/** Правило автоматизации: событие → условия → действия. */
export const crmAutomations = pgTable("crm_automations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  trigger: text("trigger").notNull(),
  /** Условия: этап, источник, минуты без ответа и т.п. */
  conditions: jsonb("conditions").$type<Record<string, string | number | null>>().notNull().default({}),
  actions: jsonb("actions").$type<AutomationAction[]>().notNull().default([]),
  active: boolean("active").notNull().default(true),
  runs: integer("runs").notNull().default(0),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  ...timestamps,
});

/** Журнал срабатываний: одно правило не срабатывает дважды для одного объекта. */
export const crmAutomationRuns = pgTable(
  "crm_automation_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    automationId: uuid("automation_id")
      .notNull()
      .references(() => crmAutomations.id, { onDelete: "cascade" }),
    subject: text("subject").notNull(),
    /**
     * Чем кончилось срабатывание (automation-13): running — действия идут или процесс упал посреди них, done, error,
     * deferred — сообщение клиенту ждёт окна (automation-d1). Старые отметки — done.
     */
    status: text("status", { enum: ["running", "done", "error", "deferred"] }).notNull().default("done"),
    /** Контекст и шаги срабатывания (RunDetails); через 90 дней чистится, отметка остаётся. */
    details: jsonb("details").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("crm_auto_runs_idx").on(t.automationId, t.subject),
    // Журнал на странице правила — последние срабатывания.
    index("crm_auto_runs_rule_time_idx").on(t.automationId, t.createdAt),
    // Отложенные сообщения для 30-минутного прохода — их единицы.
    index("crm_auto_runs_deferred_idx").on(t.createdAt).where(sql`${t.status} = 'deferred'`),
    // Чистка подробностей старше 90 дней — порциями по этому индексу.
    index("crm_auto_runs_details_idx").on(t.createdAt).where(sql`${t.details} is not null`),
  ],
);
