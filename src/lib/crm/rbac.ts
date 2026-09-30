import "server-only";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { eq, isNull, or, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { getCurrentUser } from "../auth";
import { db } from "../db";
import { crmAudit, crmRoles, type User } from "../db/schema";
import { clientIp } from "../rate-limit";
import { allPermissions, maskEmail, maskPhone, type Permission, type RoleScope } from "./permissions";

export interface Staff {
  user: User;
  roleName: string;
  roleKey: string | null;
  scope: RoleScope;
  permissions: ReadonlySet<Permission>;
  /** Руководитель: все права, роль не ограничивает. */
  isOwner: boolean;
}

/** Текущий сотрудник (role = admin, не отключён) с правами роли. Кэшируется на запрос. */
export const getStaff = cache(async (): Promise<Staff | null> => {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin" || user.staffDisabled) return null;
  const role = user.crmRoleId ? await db.query.crmRoles.findFirst({ where: eq(crmRoles.id, user.crmRoleId) }) : null;
  // Сотрудник без роли — владелец (так работают аккаунты, созданные до появления ролей).
  const isOwner = !role || role.key === "owner";
  return {
    user,
    roleName: role?.name ?? "Руководитель",
    roleKey: role?.key ?? "owner",
    scope: isOwner ? "all" : role.scope,
    permissions: new Set(isOwner ? allPermissions : (role.permissions as Permission[])),
    isOwner,
  };
});

export function can(staff: Staff | null, ...perms: Permission[]) {
  return !!staff && perms.every((p) => staff.permissions.has(p));
}

/** Для страниц: не сотрудник — на сайт, нет права — 404 (не раскрываем, что раздел существует). */
export async function requireStaff(...perms: Permission[]): Promise<Staff> {
  const staff = await getStaff();
  if (!staff) {
    const user = await getCurrentUser();
    redirect(user ? "/books" : "/login?next=/admin");
  }
  if (!can(staff, ...perms)) notFound();
  return staff;
}

export class ForbiddenError extends Error {
  constructor() {
    super("Недостаточно прав для этого действия");
  }
}

/** Для server actions и API: бросает ошибку без редиректа. */
export async function assertStaff(...perms: Permission[]): Promise<Staff> {
  const staff = await getStaff();
  if (!staff || !can(staff, ...perms)) throw new ForbiddenError();
  return staff;
}

/**
 * Условие видимости для роли «только свои»: запись без ответственного (неразобранное) или моя.
 * Для роли с видимостью «все» — undefined (без ограничений).
 */
export function ownScope(staff: Staff, column: AnyPgColumn): SQL | undefined {
  if (staff.scope === "all") return undefined;
  return or(eq(column, staff.user.id), isNull(column));
}

export function canSeeAssigned(staff: Staff, assigneeId: string | null | undefined) {
  return staff.scope === "all" || !assigneeId || assigneeId === staff.user.id;
}

/** Может ли сотрудник назначать ответственным кого-то кроме себя. */
export function canAssignOthers(staff: Staff) {
  return staff.scope === "all";
}

/** Проверка видимости записи для server actions: чужая запись у роли «только свои» — как будто её нет. */
export function assertVisible(staff: Staff, assigneeId: string | null | undefined) {
  if (!canSeeAssigned(staff, assigneeId)) throw new ForbiddenError();
}

/** Контакты клиента с учётом права clients.contacts. */
export function contactView(staff: Staff, v: { phone?: string | null; email?: string | null }) {
  const full = can(staff, "clients.contacts");
  return { phone: full ? (v.phone ?? "") : maskPhone(v.phone), email: full ? (v.email ?? "") : maskEmail(v.email), masked: !full };
}

/** Запись в журнал действий. Ошибка журнала не должна ломать основное действие. */
export async function audit(staff: Staff | null, action: string, entity: string, entityId?: string | null, details?: Record<string, unknown>) {
  try {
    await db.insert(crmAudit).values({ actorId: staff?.user.id ?? null, action, entity, entityId: entityId ?? null, details: details ?? null, ip: await clientIp().catch(() => null) });
  } catch (err) {
    console.error("[audit]", err);
  }
}

export const actorLabel = (staff: Staff) => `admin:${staff.user.email}`;
