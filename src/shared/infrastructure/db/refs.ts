import { sql } from "drizzle-orm";

/**
 * Колонки внешнего запроса для коррелированных подзапросов.
 * Drizzle в запросах по одной таблице пишет колонку без имени таблицы (`"id"`),
 * и внутри подзапроса такая ссылка указывает на таблицу подзапроса. Здесь имя таблицы всегда явное.
 */
export const booksId = sql.raw(`"books"."id"`);
export const usersId = sql.raw(`"users"."id"`);
export const ordersId = sql.raw(`"orders"."id"`);
export const crmDealsId = sql.raw(`"crm_deals"."id"`);
export const crmDealsClientId = sql.raw(`"crm_deals"."client_id"`);
export const crmRolesId = sql.raw(`"crm_roles"."id"`);
