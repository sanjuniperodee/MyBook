import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, isNull, ne, or, sql } from "drizzle-orm";
import { crmAudit, crmRoles, users } from "@/lib/db/schema";
import { executor } from "@/shared/infrastructure/database";
import { clientIp } from "@/lib/rate-limit";
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
  /** Активный сотрудник CRM (для назначения ответственным). */
  async activeStaff(userId: string) {
    const [u] = await executor().select({ id: users.id, name: users.name, email: users.email, role: users.role, staffDisabled: users.staffDisabled }).from(users).where(eq(users.id, userId)).limit(1);
    return u && u.role === "admin" && !u.staffDisabled ? { id: u.id, name: u.name, email: u.email } : null;
  }
}
