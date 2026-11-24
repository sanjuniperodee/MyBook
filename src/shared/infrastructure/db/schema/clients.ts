/** CRM-профиль клиента: заметки и задачи менеджеров (модуль clients). */
import { sql } from "drizzle-orm";
import { boolean, doublePrecision, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { TaskRecurrence } from "@/shared/domain/boards";
import { books } from "./authoring";
import { crmBoardColumns, crmBoards } from "./boards";
import { users } from "./identity";
import { crmConversations } from "./messaging";
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
    /** Кто отметил выполненной (tasks-1): в отчётах — кто делал, а не на кого стояла. */
    doneById: uuid("done_by_id").references(() => users.id, { onDelete: "set null" }),
    /** За сколько минут до срока напомнить ответственному (CRM со звуком и WhatsApp); null — не напоминать. */
    remindBeforeMin: integer("remind_before_min"),
    /** Когда напоминание ушло: одно на задачу. */
    remindedAt: timestamp("reminded_at", { withTimezone: true }),
    /** Когда ответственному (или всем — у ничьей) сказали, что задача просрочена (tasks-4): одно на задачу. */
    overdueNotifiedAt: timestamp("overdue_notified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // ─── Доски (модуль boards, миграция 0109) ───
    /** Доска и колонка карточки. null — доска по умолчанию («Продажи») и её первая колонка (или «Готово» у выполненной). */
    boardId: uuid("board_id").references(() => crmBoards.id, { onDelete: "set null" }),
    columnId: uuid("column_id").references(() => crmBoardColumns.id, { onDelete: "set null" }),
    /** Порядок в колонке (меньше — выше); null — по сроку, после расставленных. */
    position: doublePrecision("position"),
    description: text("description"),
    /** low | normal | high | urgent; null — без приоритета. */
    priority: text("priority", { enum: ["low", "normal", "high", "urgent"] }),
    startAt: timestamp("start_at", { withTimezone: true }),
    /** Обложка: цвет-токен («wine», «info»…) или «att:<id вложения>». */
    cover: text("cover"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    estimateMin: integer("estimate_min"),
    spentMin: integer("spent_min"),
    /** Повтор: после выполнения создаётся следующая карточка (проход планировщика). */
    recurrence: jsonb("recurrence").$type<TaskRecurrence>(),
    /** Следующая карточка повтора уже создана (одна на выполненную). */
    recurSpawnedAt: timestamp("recur_spawned_at", { withTimezone: true }),
    bookId: uuid("book_id").references(() => books.id, { onDelete: "set null" }),
    conversationId: uuid("conversation_id").references(() => crmConversations.id, { onDelete: "set null" }),
    /** Встреча с Google Meet (для Google Календаря). */
    meet: boolean("meet").notNull().default(false),
    /** Меняется триггером БД при любой правке строки — для синхронизации календарей и живого обновления. */
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("crm_tasks_board_idx").on(t.boardId, t.columnId).where(sql`${t.archivedAt} is null`),
    index("crm_tasks_updated_idx").on(t.updatedAt),
    index("crm_tasks_due_idx").on(t.doneAt, t.dueAt),
    // Открытые задачи сделки: переходят к новому ответственному, служебные не дублируются.
    index("crm_tasks_open_deal_idx").on(t.dealId).where(sql`${t.doneAt} is null`),
    // Все задачи сделки: последняя активность по сделке (правило «Сделка без активности»).
    index("crm_tasks_deal_idx").on(t.dealId).where(sql`${t.dealId} is not null`),
  ],
);
