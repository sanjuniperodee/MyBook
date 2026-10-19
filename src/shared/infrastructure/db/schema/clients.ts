/** CRM-профиль клиента: заметки и задачи менеджеров (модуль clients). */
import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./identity";
import { orders } from "./ordering";
import { crmDeals } from "./sales";

/** Заметки менеджеров о клиенте (история общения). */
export const crmNotes = pgTable(
  "crm_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Клиент; у заметки по сделке без клиента (новый номер из чата/звонка) — null. */
    clientId: uuid("client_id").references(() => users.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    dealId: uuid("deal_id").references(() => crmDeals.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    kind: text("kind", { enum: ["note", "call", "message", "email", "system"] }).notNull().default("note"),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("crm_notes_client_idx").on(t.clientId), index("crm_notes_deal_idx").on(t.dealId)],
);

/** Задачи менеджеров: перезвонить, проверить макет, отправить трек-номер… */
export const crmTasks = pgTable(
  "crm_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    clientId: uuid("client_id").references(() => users.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "cascade" }),
    dealId: uuid("deal_id").references(() => crmDeals.id, { onDelete: "cascade" }),
    /** Тип задачи: звонок, написать, встреча, прочее. */
    kind: text("kind", { enum: ["task", "call", "message", "meeting"] }).notNull().default("task"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    /** Результат выполнения (как в amoCRM: «дозвонился, договорились…»). */
    result: text("result"),
    doneAt: timestamp("done_at", { withTimezone: true }),
    /** За сколько минут до срока напомнить ответственному (CRM со звуком и WhatsApp); null — не напоминать. */
    remindBeforeMin: integer("remind_before_min"),
    /** Когда напоминание ушло: одно на задачу. */
    remindedAt: timestamp("reminded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("crm_tasks_due_idx").on(t.doneAt, t.dueAt),
    // Открытые задачи сделки: переходят к новому ответственному, служебные не дублируются.
    index("crm_tasks_open_deal_idx").on(t.dealId).where(sql`${t.doneAt} is null`),
    // Все задачи сделки: последняя активность по сделке (правило «Сделка без активности»).
    index("crm_tasks_deal_idx").on(t.dealId).where(sql`${t.dealId} is not null`),
  ],
);
