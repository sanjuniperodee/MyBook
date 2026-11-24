/** Доски задач (модуль boards): доски, колонки, метки, участники карточек, чек-листы, комментарии, вложения, журнал, виды, правила, календари. */
import { sql } from "drizzle-orm";
import { boolean, doublePrecision, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { BoardRuleAction, BoardRuleTrigger } from "@/shared/domain/boards";
import { crmTasks } from "./clients";
import { users } from "./identity";

/** Доска: общая (отдел), личная или проект. Карточки — строки crm_tasks с board_id. */
export const crmBoards = pgTable(
  "crm_boards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description"),
    kind: text("kind", { enum: ["team", "personal", "project"] }).notNull().default("team"),
    /** Отдел общей доски: sales | production | support; null — без отдела. */
    department: text("department"),
    color: text("color").notNull().default("slate"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    /** all — видят все сотрудники; members — владелец и участники. */
    visibility: text("visibility", { enum: ["all", "members"] }).notNull().default("all"),
    /** Доска по умолчанию: на ней задачи без доски (из сделок, правил, бота). Одна. */
    isDefault: boolean("is_default").notNull().default(false),
    templateKey: text("template_key"),
    position: doublePrecision("position").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("crm_boards_default_uq").on(t.isDefault).where(sql`${t.isDefault}`)],
);

export const crmBoardColumns = pgTable(
  "crm_board_columns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => crmBoards.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: doublePrecision("position").notNull().default(0),
    /** Колонка «Готово»: карточка в ней выполнена, выполненная карточка — в ней. */
    done: boolean("done").notNull().default(false),
    /** Лимит карточек в работе; превышение подсвечивается. null — без лимита. */
    wipLimit: integer("wip_limit"),
    color: text("color"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("crm_board_columns_board_idx").on(t.boardId, t.position)],
);

export const crmBoardMembers = pgTable(
  "crm_board_members",
  {
    boardId: uuid("board_id")
      .notNull()
      .references(() => crmBoards.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** admin — меняет колонки, участников и правила доски. */
    role: text("role", { enum: ["admin", "member"] }).notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.boardId, t.userId] }), index("crm_board_members_user_idx").on(t.userId)],
);

export const crmLabels = pgTable(
  "crm_labels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    boardId: uuid("board_id").references(() => crmBoards.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("slate"),
    position: doublePrecision("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("crm_labels_board_idx").on(t.boardId)],
);

export const crmTaskLabels = pgTable(
  "crm_task_labels",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => crmTasks.id, { onDelete: "cascade" }),
    labelId: uuid("label_id")
      .notNull()
      .references(() => crmLabels.id, { onDelete: "cascade" }),
    /** Поставило правило «срок прошёл»: снимается само, когда срок перенесли вперёд или карточку выполнили. */
    auto: boolean("auto").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.labelId] }), index("crm_task_labels_label_idx").on(t.labelId)],
);

/** Исполнители (кроме главного — crm_tasks.assignee_id) и наблюдатели карточки. */
export const crmTaskMembers = pgTable(
  "crm_task_members",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => crmTasks.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["assignee", "watcher"] }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.userId, t.role] }), index("crm_task_members_user_idx").on(t.userId, t.role)],
);

export const crmTaskChecklists = pgTable(
  "crm_task_checklists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => crmTasks.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    position: doublePrecision("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("crm_task_checklists_task_idx").on(t.taskId)],
);

/** Пункт чек-листа — подзадача: свой исполнитель и срок по желанию. */
export const crmTaskChecklistItems = pgTable(
  "crm_task_checklist_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    checklistId: uuid("checklist_id")
      .notNull()
      .references(() => crmTaskChecklists.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    position: doublePrecision("position").notNull().default(0),
    doneAt: timestamp("done_at", { withTimezone: true }),
    doneById: uuid("done_by_id").references(() => users.id, { onDelete: "set null" }),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("crm_task_checklist_items_list_idx").on(t.checklistId)],
);

export const crmTaskComments = pgTable(
  "crm_task_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => crmTasks.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
  },
  (t) => [index("crm_task_comments_task_idx").on(t.taskId, t.createdAt)],
);

/** Вложения карточки: файл в общем хранилище (S3), ключ tasks/<taskId>/<id>. */
export const crmTaskAttachments = pgTable(
  "crm_task_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => crmTasks.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    name: text("name").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    uploadedById: uuid("uploaded_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("crm_task_attachments_task_idx").on(t.taskId)],
);

/** Журнал действий карточки: создали, перенесли, назначили, срок, метки, чек-лист, вложения, правила. */
export const crmTaskActivity = pgTable(
  "crm_task_activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => crmTasks.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("crm_task_activity_task_idx").on(t.taskId, t.createdAt)],
);

/** Сохранённые фильтры и виды: свои или общие для доски. */
export const crmTaskViews = pgTable(
  "crm_task_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    boardId: uuid("board_id").references(() => crmBoards.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Строка запроса фильтра (как в адресе страницы): view=list&who=me&label=… */
    query: text("query").notNull(),
    shared: boolean("shared").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("crm_task_views_user_idx").on(t.userId)],
);

/** Правило доски: событие карточки → действия. */
export const crmBoardRules = pgTable(
  "crm_board_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => crmBoards.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    trigger: jsonb("trigger").$type<BoardRuleTrigger>().notNull(),
    actions: jsonb("actions").$type<BoardRuleAction[]>().notNull(),
    enabled: boolean("enabled").notNull().default(true),
    position: doublePrecision("position").notNull().default(0),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    runs: integer("runs").notNull().default(0),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("crm_board_rules_board_idx").on(t.boardId)],
);

/** Срабатывания правил по времени («срок прошёл»): одно на карточку и срок. */
export const crmBoardRuleRuns = pgTable(
  "crm_board_rule_runs",
  {
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => crmBoardRules.id, { onDelete: "cascade" }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => crmTasks.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.ruleId, t.taskId, t.key] })],
);

/** Личная iCal-ссылка сотрудника (подписка в Google/Apple Календаре, только чтение). Храним хеш токена. */
export const crmCalendarFeeds = pgTable(
  "crm_calendar_feeds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("crm_calendar_feeds_token_uq").on(t.tokenHash), index("crm_calendar_feeds_user_idx").on(t.userId)],
);

/** Google Календарь сотрудника: токены (зашифрованы), отдельный календарь «MyBooks CRM», push-канал и курсор синхронизации. */
export const crmGoogleAccounts = pgTable("crm_google_accounts", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  email: text("email"),
  refreshToken: text("refresh_token").notNull(),
  accessToken: text("access_token"),
  accessExpiresAt: timestamp("access_expires_at", { withTimezone: true }),
  calendarId: text("calendar_id"),
  syncToken: text("sync_token"),
  channelId: text("channel_id"),
  channelToken: text("channel_token"),
  resourceId: text("resource_id"),
  channelExpiresAt: timestamp("channel_expires_at", { withTimezone: true }),
  /** Пришло push-уведомление — забрать изменения при ближайшем проходе. */
  pullRequestedAt: timestamp("pull_requested_at", { withTimezone: true }),
  lastPushAt: timestamp("last_push_at", { withTimezone: true }),
  lastPullAt: timestamp("last_pull_at", { withTimezone: true }),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Событие Google Календаря для карточки у сотрудника. */
export const crmGoogleEvents = pgTable(
  "crm_google_events",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => crmTasks.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => crmGoogleAccounts.userId, { onDelete: "cascade" }),
    eventId: text("event_id").notNull(),
    etag: text("etag"),
    /** updated_at карточки, с которым событие совпадает: больше — пора отправить. */
    taskVersion: timestamp("task_version", { withTimezone: true }),
    meetUrl: text("meet_url"),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.userId] }), uniqueIndex("crm_google_events_event_uq").on(t.userId, t.eventId)],
);
