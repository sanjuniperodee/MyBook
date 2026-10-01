import "server-only";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { trustedClientIp } from "@/server/rateLimit";
import type { Permission, RoleScope, StaffContext, StaffGate } from "@/modules/access";
import { getCurrentUser, type User } from "./auth";
import { container } from "./container";

/**
 * Веб-адаптер прав сотрудников CRM: guards для страниц (редирект/404), server actions и API (исключение).
 * Правила (роли, видимость, правила безопасности) — в AccessModule.
 */
export interface Staff {
  user: User;
  roleName: string;
  roleKey: string | null;
  scope: RoleScope;
  permissions: ReadonlySet<Permission>;
  /** Руководитель: все права, роль не ограничивает. */
  isOwner: boolean;
  /** Контекст прав из домена Access. */
  context: StaffContext;
}

export type { StaffGate };

export class ForbiddenError extends Error {
  constructor(message = "Недостаточно прав для этого действия") {
    super(message);
  }
}

const account = (u: User) => ({ id: u.id, role: u.role, staffDisabled: u.staffDisabled, crmRoleId: u.crmRoleId, twoFactorEnabled: !!u.totpEnabledAt && !!u.totpSecret });

/** Сотрудник без проверок безопасности — для каркаса админки и страницы «Безопасность». */
const loadStaff = cache(async (): Promise<Staff | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const ctx = await container().access.resolver.resolve(account(user));
  if (!ctx) return null;
  return { user, roleName: ctx.roleName, roleKey: ctx.roleKey, scope: ctx.scope, permissions: ctx.permissions, isOwner: ctx.isOwner, context: ctx };
});

/** Что мешает сотруднику работать в CRM: вход не из разрешённой сети или не настроена обязательная 2FA. */
export const staffGate = cache(async (): Promise<StaffGate> => {
  const staff = await loadStaff();
  if (!staff) return null;
  return container().access.resolver.gate(account(staff.user), await trustedClientIp());
});

/** Текущий сотрудник, если его ничего не блокирует. Кэшируется на запрос. */
export const getStaff = cache(async (): Promise<Staff | null> => {
  const staff = await loadStaff();
  if (!staff) return null;
  return (await staffGate()) ? null : staff;
});

export function can(staff: Staff | null, ...perms: Permission[]) {
  return !!staff && staff.context.can(...perms);
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

/** Для server actions и API: исключение без редиректа. */
export async function assertStaff(...perms: Permission[]): Promise<Staff> {
  const staff = await getStaff();
  if (!staff || !can(staff, ...perms)) throw new ForbiddenError();
  return staff;
}

/** Каркас админки и «Безопасность»: пускает сотрудника, которому осталось только настроить 2FA. */
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

export async function assertStaffShell(): Promise<Staff> {
  const staff = await loadStaff();
  if (!staff || (await staffGate()) === "ip") throw new ForbiddenError();
  return staff;
}

export function canSeeAssigned(staff: Staff, assigneeId: string | null | undefined) {
  return staff.context.canSee(assigneeId);
}

export function canAssignOthers(staff: Staff) {
  return staff.context.canAssignOthers;
}

/** Чужая запись у роли «только свои» — как будто её нет. */
export function assertVisible(staff: Staff, assigneeId: string | null | undefined) {
  if (!canSeeAssigned(staff, assigneeId)) throw new ForbiddenError();
}

export function contactView(staff: Staff, v: { phone?: string | null; email?: string | null }) {
  return staff.context.contacts(v);
}

/** Запись в журнал действий. */
export async function audit(staff: Staff | null, action: string, entity: string, entityId?: string | null, details?: Record<string, unknown>) {
  await container().access.audit.record({ actorId: staff?.user.id ?? null, action, entity, entityId, details });
}

export const actorLabel = (staff: Staff) => `admin:${staff.user.email}`;
