import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { crmAudit, crmCalls, crmDeals, crmRoles, users } from "@/shared/infrastructure/db/schema";
import { crmRolesId, usersId } from "@/shared/infrastructure/db/refs";
import { executor } from "@/shared/infrastructure/database";
import { clientIp } from "@/server/rateLimit";
import { Role, StaffMember, type Permission, type RoleRepository, type StaffRepository } from "../domain";
import type { AuditLog } from "../application/ports";

const roleToDomain = (r: typeof crmRoles.$inferSelect) => Role.restore(r.id, { name: r.name, scope: r.scope, permissions: r.permissions as Permission[], key: r.key });

export class DrizzleRoleRepository implements RoleRepository {
  nextId() {
    return randomUUID();
  }
  async findById(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const [r] = await executor().select().from(crmRoles).where(eq(crmRoles.id, id)).limit(1);
    return r ? roleToDomain(r) : null;
  }
  async findByKey(key: string) {
    const [r] = await executor().select().from(crmRoles).where(eq(crmRoles.key, key)).limit(1);
    return r ? roleToDomain(r) : null;
  }
  async assignedCount(roleId: string) {
    const [{ n }] = await executor().select({ n: sql<number>`count(*)::int` }).from(users).where(eq(users.crmRoleId, roleId));
    return n;
  }
  async add(role: Role) {
    const s = role.snapshot();
    await executor().insert(crmRoles).values({ id: role.id, name: s.name, scope: s.scope, permissions: [...s.permissions], key: s.key });
  }
  async save(role: Role) {
    const s = role.snapshot();
    await executor().update(crmRoles).set({ name: s.name, scope: s.scope, permissions: [...s.permissions] }).where(eq(crmRoles.id, role.id));
  }
  async remove(roleId: string) {
    await executor().delete(crmRoles).where(eq(crmRoles.id, roleId));
  }
}

const staffToDomain = (r: typeof users.$inferSelect) =>
  StaffMember.restore(r.id, { email: r.email, name: r.name, accountRole: r.role, roleId: r.crmRoleId, extension: r.sipExtension, disabled: r.staffDisabled });

/** Сотрудник — те же строки users, но только колонки доступа к CRM. */
export class DrizzleStaffRepository implements StaffRepository {
  async findById(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const [r] = await executor().select().from(users).where(eq(users.id, id)).limit(1);
    return r ? staffToDomain(r) : null;
  }
  async findByEmail(email: string) {
    const [r] = await executor().select().from(users).where(sql`lower(${users.email}) = ${email.toLowerCase()}`).limit(1);
    return r ? staffToDomain(r) : null;
  }
  async activeOwnersExcept(userId: string, ownerRoleId: string | null) {
    const [{ n }] = await executor()
      .select({ n: sql<number>`count(*)::int` })
      .from(users)
      .where(and(eq(users.role, "admin"), eq(users.staffDisabled, false), ne(users.id, userId), ownerRoleId ? or(isNull(users.crmRoleId), eq(users.crmRoleId, ownerRoleId)) : isNull(users.crmRoleId)));
    return n;
  }
  async extensionOwner(extension: string, exceptUserId: string) {
    const [r] = await executor().select({ email: users.email }).from(users).where(and(eq(users.sipExtension, extension), ne(users.id, exceptUserId))).limit(1);
    return r?.email ?? null;
  }
  async save(m: StaffMember) {
    const s = m.snapshot();
    await executor().update(users).set({ role: s.accountRole, crmRoleId: s.roleId, sipExtension: s.extension, staffDisabled: s.disabled, updatedAt: new Date() }).where(eq(users.id, m.id));
  }
}

/** Журнал действий. Ошибка журнала не ломает основное действие. */
export const drizzleAuditLog: AuditLog = {
  async record(e) {
    try {
      await executor().insert(crmAudit).values({ actorId: e.actorId, action: e.action, entity: e.entity, entityId: e.entityId ?? null, details: e.details ?? null, ip: await clientIp().catch(() => null) });
    } catch (err) {
      console.error("[audit]", err);
    }
  },
};

/** «На смене» — сотрудник получает новые заявки по кругу. */
export const drizzleShifts = {
  async set(userId: string, onShift: boolean) {
    await executor().update(users).set({ onShift }).where(eq(users.id, userId));
  },
};

/** Read-модели сотрудников для страниц и действий CRM. */
export class DrizzleAccessQueries {
  /** Все сотрудники, включая отключённых (их имена нужны в истории). Для выпадающих списков — staffOptions(). */
  allStaff() {
    return executor().select({ id: users.id, name: users.name, email: users.email, disabled: users.staffDisabled }).from(users).where(eq(users.role, "admin")).orderBy(users.name);
  }

  roles() {
    return executor().select({ id: crmRoles.id, name: crmRoles.name, key: crmRoles.key }).from(crmRoles).orderBy(asc(crmRoles.createdAt));
  }

  /** Роли с числом сотрудников. */
  rolesWithMembers() {
    return executor()
      .select({ role: crmRoles, members: sql<number>`(select count(*)::int from ${users} u where u.crm_role_id = ${crmRolesId} and u.role = 'admin')` })
      .from(crmRoles)
      .orderBy(asc(crmRoles.createdAt));
  }

  /** Команда: сотрудники с открытыми сделками и звонками за неделю. */
  team() {
    return executor()
      .select({
        user: users,
        openDeals: sql<number>`(select count(*)::int from ${crmDeals} d where d.assignee_id = ${usersId} and d.closed_at is null)`,
        calls7d: sql<number>`(select count(*)::int from ${crmCalls} c where c.staff_id = ${usersId} and c.started_at > now() - interval '7 days')`,
      })
      .from(users)
      .where(eq(users.role, "admin"))
      .orderBy(asc(users.staffDisabled), asc(users.createdAt));
  }

  /** Активные сотрудники по имени (планы продаж). */
  activeStaffList() {
    return executor().select({ id: users.id, name: users.name, email: users.email }).from(users).where(and(eq(users.role, "admin"), eq(users.staffDisabled, false))).orderBy(users.name);
  }

  /** Статус 2FA у сотрудников (страница «Безопасность»). */
  twoFactorStatus() {
    return executor()
      .select({ id: users.id, name: users.name, email: users.email, totpEnabledAt: users.totpEnabledAt, staffDisabled: users.staffDisabled })
      .from(users)
      .where(eq(users.role, "admin"))
      .orderBy(asc(users.createdAt));
  }

  /** Журнал действий с фильтром по сотруднику и сущности. */
  auditLog(filter: { actorId?: string; entity?: string }) {
    const w: SQL[] = [];
    if (filter.actorId) w.push(eq(crmAudit.actorId, filter.actorId));
    if (filter.entity) w.push(eq(crmAudit.entity, filter.entity));
    return executor()
      .select({ a: crmAudit, actor: { name: users.name, email: users.email } })
      .from(crmAudit)
      .leftJoin(users, eq(users.id, crmAudit.actorId))
      .where(w.length ? and(...w) : undefined)
      .orderBy(desc(crmAudit.createdAt))
      .limit(300);
  }

  /** Активный сотрудник CRM (для назначения ответственным). */
  async activeStaff(userId: string) {
    const [u] = await executor().select({ id: users.id, name: users.name, email: users.email, role: users.role, staffDisabled: users.staffDisabled }).from(users).where(eq(users.id, userId)).limit(1);
    return u && u.role === "admin" && !u.staffDisabled ? { id: u.id, name: u.name, email: u.email } : null;
  }
}
