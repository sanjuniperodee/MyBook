import "server-only";
import { and, asc, desc, eq, isNull, ne, or, sql } from "drizzle-orm";
import { crmRoles, orders, users } from "@/shared/infrastructure/db/schema";
import { usersId } from "@/shared/infrastructure/db/refs";
import { phoneKey, normalizePhone } from "@/shared/domain/phone";
import { toAttribution } from "@/shared/domain/channels";
import type { SettingsReader, WorkSchedule } from "@/shared/application";
import { executor } from "@/shared/infrastructure/database";
import type { BookProgress, ClientDirectory, SalesSettings, StaffRouter } from "../application";
import type { StageMilestone } from "../domain";
import { inExtra, phoneDigits } from "./persistence";

export const drizzleClients: ClientDirectory = {
  async findByPhone(phone) {
    const key = phoneKey(phone);
    if (key.length < 10) return null;
    const [u] = await executor()
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, "user"), or(sql`${phoneDigits(users.phone)} = ${key}`, inExtra(users.extraPhones, key))))
      .limit(1);
    if (u) return u.id;
    const [o] = await executor().select({ id: orders.userId }).from(orders).where(sql`${phoneDigits(orders.contactPhone)} = ${key}`).orderBy(desc(orders.createdAt)).limit(1);
    return o?.id ?? null;
  },
  async profile(clientId) {
    const [u] = await executor().select({ name: users.name, email: users.email, phone: users.phone, managerId: users.managerId, source: users.source }).from(users).where(eq(users.id, clientId)).limit(1);
    if (!u) return null;
    return { name: u.name, email: u.email, phone: u.phone ? normalizePhone(u.phone) : null, managerId: u.managerId, utm: toAttribution(u.source) as Record<string, string> | null };
  },
  async adoptManager(clientId, managerId) {
    await executor().update(users).set({ managerId }).where(and(eq(users.id, clientId), isNull(users.managerId)));
  },
};

/** Настройки CRM, которые читают продажи: «Неразобранное» и с какого действия клиента заводить сделку. */
export type SalesSettingKey = "crm.unsorted" | "crm.autoDealFrom";

export const crmSalesSettings = (settings: SettingsReader<SalesSettingKey>): SalesSettings => ({
  unsortedEnabled: async () => (await settings.get("crm.unsorted")) !== "off",
  autoDealFrom: async () => (await settings.get("crm.autoDealFrom")) as StageMilestone | "off",
});

const lastDealAt = sql`(select max(d.created_at) from crm_deals d where d.assignee_id = ${usersId}) asc nulls first`;

/**
 * Следующий менеджер по кругу: активный сотрудник на смене с правом deals.edit (не руководитель),
 * которому дольше всех не доставалась новая сделка. Вне рабочего времени — никому: утром возьмёт первый на смене.
 */
export const roundRobinRouter = (schedule: WorkSchedule): StaffRouter => ({
  async nextRoundRobin() {
    if (!(await schedule.isWorkTime(new Date()))) return null;
    const base = and(eq(users.role, "admin"), eq(users.staffDisabled, false), eq(users.onShift, true), sql`'deals.edit' = any(${crmRoles.permissions})`);
    const [row] = await executor().select({ id: users.id }).from(users).innerJoin(crmRoles, eq(crmRoles.id, users.crmRoleId)).where(and(base, ne(crmRoles.key, "owner"))).orderBy(lastDealAt, asc(users.createdAt)).limit(1);
    if (row) return row.id;
    // Роль без ключа (своя) тоже подходит: ne(key,'owner') отсекает null, поэтому проверяем её отдельно.
    const [custom] = await executor().select({ id: users.id }).from(users).innerJoin(crmRoles, eq(crmRoles.id, users.crmRoleId)).where(and(base, isNull(crmRoles.key))).orderBy(lastDealAt).limit(1);
    return custom?.id ?? null;
  },
});

export const sqlBookProgress: BookProgress = {
  async progress(bookId) {
    const { rows } = await executor().execute<{ answered: number; total: number }>(sql`
      select count(*) filter (where length(trim(answer)) > 0)::int as answered, count(*)::int as total
      from book_questions where book_id = ${bookId}`);
    return rows[0] ?? null;
  },
};
