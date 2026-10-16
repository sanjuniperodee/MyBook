import "server-only";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { orders, users } from "@/shared/infrastructure/db/schema";
import { phoneKey, normalizePhone } from "@/shared/domain/phone";
import { toAttribution } from "@/shared/domain/channels";
import type { SettingsReader, WorkSchedule } from "@/shared/application";
import { executor } from "@/shared/infrastructure/database";
import type { BookProgress, ClientDirectory, SalesSettings, StaffRouter } from "../application";
import type { StageMilestone } from "@/shared/domain/stageMilestones";
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
export type SalesSettingKey = "crm.unsorted" | "crm.autoDealFrom" | "crm.reassignMinutes";

/** По умолчанию не взятая заявка уходит следующему через 15 минут. */
export const DEFAULT_REASSIGN_MINUTES = 15;

export const crmSalesSettings = (settings: SettingsReader<SalesSettingKey>): SalesSettings => ({
  unsortedEnabled: async () => (await settings.get("crm.unsorted")) !== "off",
  autoDealFrom: async () => (await settings.get("crm.autoDealFrom")) as StageMilestone | "off",
  async reassignMinutes() {
    const raw = await settings.get("crm.reassignMinutes");
    const n = raw === null || raw === undefined || raw === "" ? DEFAULT_REASSIGN_MINUTES : Number(raw);
    return Number.isFinite(n) && n >= 0 ? Math.min(Math.floor(n), 24 * 60) : DEFAULT_REASSIGN_MINUTES;
  },
});

/** Номер advisory-блокировки раздачи заявок (до конца транзакции). */
const ROUTING_LOCK = 7_310_453;

/**
 * Круг на SQL. Кто в круге: активный сотрудник на смене с правом deals.edit, роль не «Руководитель» (своя роль без ключа —
 * тоже в круге). Очередь: меньше назначений за сегодня (день — в поясе магазина), при равенстве — кому дольше не назначали.
 */
export const roundRobinRouter = (schedule: WorkSchedule, timeZone: () => string): StaffRouter => ({
  isWorkTime: () => schedule.isWorkTime(new Date()),
  async lock() {
    await executor().execute(sql`select pg_advisory_xact_lock(${ROUTING_LOCK})`);
  },
  async next(exclude) {
    const tz = timeZone();
    const today = sql`(date_trunc('day', now() at time zone ${tz}) at time zone ${tz})`;
    const { rows } = await executor().execute<{ id: string }>(sql`
      select u.id from users u join crm_roles r on r.id = u.crm_role_id
      where u.role = 'admin' and not u.staff_disabled and u.on_shift
        and 'deals.edit' = any(r.permissions) and r.key is distinct from 'owner'
        and not (u.id = any(${`{${exclude.join(",")}}`}::uuid[]))
      order by
        (select count(*) from crm_deals d where d.assignee_id = u.id and d.assigned_at >= ${today}) asc,
        (select max(d.assigned_at) from crm_deals d where d.assignee_id = u.id) asc nulls first,
        u.created_at asc
      limit 1`);
    return rows[0]?.id ?? null;
  },
  async isActive(userId) {
    const [u] = await executor().select({ id: users.id }).from(users).where(and(eq(users.id, userId), eq(users.role, "admin"), eq(users.staffDisabled, false))).limit(1);
    return !!u;
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
