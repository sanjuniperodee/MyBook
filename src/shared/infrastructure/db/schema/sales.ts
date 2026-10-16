/** Продажи: воронки и этапы, сделки, платежи и чеки, история этапов, планы, сохранённые фильтры (модуль sales). */
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { CustomFieldValues } from "@/shared/domain/customFields";
import type { DealSource } from "@/shared/domain/dealSources";
import type { StageMilestone } from "@/shared/domain/stageMilestones";
import { timestamps } from "./columns";
import { users } from "./identity";
import { orders } from "./ordering";

/** Воронка продаж: «Продажи», «Корпоративные», «Партнёры»… У каждой свои этапы. */
export const crmPipelines = pgTable("crm_pipelines", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
  ...timestamps,
});

/** Этапы воронки продаж. kind: open — в работе, won — успех, lost — отказ. */
export const crmStages = pgTable("crm_stages", {
  id: uuid("id").primaryKey().defaultRandom(),
  pipelineId: uuid("pipeline_id")
    .notNull()
    .references(() => crmPipelines.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull().default("#9a8f86"),
  position: integer("position").notNull().default(0),
  kind: text("kind", { enum: ["open", "won", "lost"] }).notNull().default("open"),
  /** Событие на сайте, которое само переводит сделку на этот этап (только вперёд по воронке). */
  milestone: text("milestone").$type<StageMilestone>(),
  ...timestamps,
});

/** Сделка (лид): обращение, которое ведём до заказа. */
export const crmDeals = pgTable(
  "crm_deals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: serial("number").notNull(),
    title: text("title").notNull(),
    stageId: uuid("stage_id")
      .notNull()
      .references(() => crmStages.id),
    amount: integer("amount").notNull().default(0),
    clientId: uuid("client_id").references(() => users.id, { onDelete: "set null" }),
    contactName: text("contact_name").notNull().default(""),
    contactPhone: text("contact_phone"),
    contactEmail: text("contact_email"),
    source: text("source").$type<DealSource>().notNull().default("manual"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    /** Когда назначен нынешний ответственный: очередь круга (кому меньше за сегодня) и «нет ответа N минут». */
    assignedAt: timestamp("assigned_at", { withTimezone: true }),
    /** Кому круг уже отдавал эту заявку: при «нет ответа» она идёт следующему, а не по второму разу тем же. */
    routeTried: uuid("route_tried").array().notNull().default(sql`'{}'::uuid[]`),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    lostReason: text("lost_reason"),
    /** «Неразобранное»: заявка с нового номера ждёт, пока менеджер её примет или отклонит. */
    unsorted: boolean("unsorted").notNull().default(false),
    extraPhones: text("extra_phones").array().notNull().default(sql`'{}'::text[]`),
    /** Откуда пришёл клиент: UTM-метки, реферер, короткая ссылка (из профиля на сайте или кода в первом сообщении). */
    utm: jsonb("utm").$type<Record<string, string>>(),
    /** Значения своих полей (crm_fields, entity = deal): { key: значение }. */
    customFields: jsonb("custom_fields").$type<CustomFieldValues>().notNull().default({}),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    /** Тариф, о котором договорились с клиентом (договорная цена относится к нему): при заказе по договорённости тариф фиксирован. */
    agreedPlan: text("agreed_plan"),
    /** Последнее AI-резюме сделки: ситуация, следующий шаг, «температура». */
    aiSummary: jsonb("ai_summary").$type<{ summary: string; nextStep: string; dueDays: number; temperature: "hot" | "warm" | "cold"; risks: string; at: string }>(),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    stageChangedAt: timestamp("stage_changed_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("crm_deals_stage_idx").on(t.stageId), index("crm_deals_assignee_idx").on(t.assigneeId), index("crm_deals_client_idx").on(t.clientId), index("crm_deals_assigned_idx").on(t.assignedAt)],
);

/**
 * Платежи по сделке, оформленной вручную (предоплата, доплата): деньги, которые менеджер принял помимо заказа на сайте.
 * Это единственный источник правды о таких деньгах: из него (вместе с оплаченными заказами) строится вьюха
 * revenue_events, а её читают обзор, аналитика, планы, карточка клиента и каналы.
 */
export const crmPayments = pgTable(
  "crm_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => crmDeals.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => users.id, { onDelete: "cascade" }),
    /** Сумма платежа, ₸ (больше нуля). */
    amount: integer("amount").notNull(),
    /** prepayment — первый платёж по сделке, payment — следующие, refund — возврат денег клиенту (в выручке со знаком минус). */
    kind: text("kind", { enum: ["prepayment", "payment", "refund"] }).notNull().default("payment"),
    /** Когда деньги получены (по нему платёж попадает в выручку по дням). */
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
    note: text("note").notNull().default(""),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("crm_payments_deal_idx").on(t.dealId), index("crm_payments_paid_idx").on(t.paidAt)],
);

/** Чеки об оплате (скриншот перевода, фото чека, PDF): файл лежит в хранилище, здесь — метаданные. */
export const crmReceipts = pgTable(
  "crm_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => crmDeals.id, { onDelete: "cascade" }),
    /** Платёж, который подтверждает чек. */
    paymentId: uuid("payment_id").references(() => crmPayments.id, { onDelete: "set null" }),
    clientId: uuid("client_id").references(() => users.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    fileName: text("file_name").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    /** Сумма по чеку, ₸ (0 — не указана). Деньги считаются по платежам, а не по чекам. */
    amount: integer("amount").notNull().default(0),
    uploadedById: uuid("uploaded_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("crm_receipts_deal_idx").on(t.dealId)],
);

/** История смены этапов: основа честной воронки (конверсия этап → этап, время на этапе). */
export const crmStageHistory = pgTable(
  "crm_stage_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => crmDeals.id, { onDelete: "cascade" }),
    fromStageId: uuid("from_stage_id").references(() => crmStages.id, { onDelete: "set null" }),
    toStageId: uuid("to_stage_id")
      .notNull()
      .references(() => crmStages.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("crm_stage_hist_deal_idx").on(t.dealId, t.createdAt), index("crm_stage_hist_to_idx").on(t.toStageId, t.createdAt)],
);

/** Сохранённые фильтры списков (свои и общие для команды). */
export const crmSavedViews = pgTable(
  "crm_saved_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entity: text("entity").notNull().default("deals"),
    name: text("name").notNull(),
    query: text("query").notNull(),
    shared: boolean("shared").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("crm_views_user_idx").on(t.userId)],
);

/** План продаж сотрудника на месяц (YYYY-MM). */
export const crmPlans = pgTable(
  "crm_plans",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    month: text("month").notNull(),
    amount: integer("amount").notNull().default(0),
    deals: integer("deals").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.month] })],
);
