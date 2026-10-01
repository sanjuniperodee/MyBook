import "server-only";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { eq, isNull, or, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { getCurrentUser } from "../auth";
import { db } from "../db";
import { crmAudit, crmRoles, type User } from "../db/schema";
import { clientIp, trustedClientIp } from "../rate-limit";
import { getSetting } from "./settings";
import { ipAllowed, parseAllowlist } from "./ip";
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

/** Сотрудник без проверок безопасности (IP, обязательная 2FA) — только для экрана настройки 2FA и каркаса админки. */
const loadStaff = cache(async (): Promise<Staff | null> => {
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

export type StaffGate = "ip" | "2fa" | null;

/** Что мешает сотруднику работать в CRM: вход не из разрешённой сети или не настроена обязательная 2FA. */
export const staffGate = cache(async (): Promise<StaffGate> => {
  const staff = await loadStaff();
  if (!staff) return null;
  const [allow, require2fa] = await Promise.all([getSetting("security.ipAllowlist"), getSetting("security.require2fa")]);
  if (allow.trim() && !ipAllowed(await trustedClientIp(), parseAllowlist(allow).rules)) return "ip";
  if (require2fa === "on" && !staff.user.totpEnabledAt) return "2fa";
  return null;
});

/** Текущий сотрудник (role = admin, не отключён) с правами роли, если его ничего не блокирует. Кэшируется на запрос. */
export const getStaff = cache(async (): Promise<Staff | null> => {
  const staff = await loadStaff();
  if (!staff) return null;
  return (await staffGate()) ? null : staff;
});

/**
 * Для каркаса админки и страницы «Безопасность»: пускает сотрудника, которому осталось только настроить 2FA.
 * Вход не из разрешённой сети — на страницу отказа.
 */
export async function requireStaffShell(): Promise<{ staff: Staff; gate: StaffGate }> {
  const staff = await loadStaff();
  if (!staff) {
    const user = await getCurrentUser();
    redirect(user ? "/books" : "/login?next=/admin");
  }
  const gate = await staffGate();
  if (gate === "ip") redirect("/admin-denied");
  return { staff, gate };
}

/** То же для server actions страницы «Безопасность». */
export async function assertStaffShell(): Promise<Staff> {
  const staff = await loadStaff();
  if (!staff || (await staffGate()) === "ip") throw new ForbiddenError();
  return staff;
}

export function can(staff: Staff | null, ...perms: Permission[]) {
  return !!staff && perms.every((p) => staff.permissions.has(p));
}

/** Для страниц: не сотрудник — на сайт, нет права — 404 (не раскрываем, что раздел существует). */
export async function requireStaff(...perms: Permission[]): Promise<Staff> {
  const staff = await getStaff();
  if (!staff) {
    const gate = await staffGate();
    if (gate === "ip") redirect("/admin-denied");
    if (gate === "2fa") redirect("/admin/security");
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
