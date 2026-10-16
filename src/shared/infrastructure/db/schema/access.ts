/** Роли сотрудников и журнал их действий (модуль access). */
import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "./columns";
import { users } from "./identity";

/** Роль сотрудника: набор прав и видимость данных. Системные роли создаются миграцией и не удаляются. */
export const crmRoles = pgTable("crm_roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Ключ системной роли (owner, manager, production, support); у своих ролей — null. */
  key: text("key").unique(),
  name: text("name").notNull(),
  permissions: text("permissions").array().notNull().default(sql`'{}'::text[]`),
  /** all — видит все сделки/клиентов/чаты; own — только где он ответственный (и неразобранное). */
  scope: text("scope", { enum: ["all", "own"] }).notNull().default("all"),
  ...timestamps,
});

/** Журнал действий сотрудников: кто, что и когда изменил. */
export const crmAudit = pgTable(
  "crm_audit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    details: jsonb("details").$type<Record<string, unknown>>(),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("crm_audit_created_idx").on(t.createdAt), index("crm_audit_entity_idx").on(t.entity, t.entityId)],
);
