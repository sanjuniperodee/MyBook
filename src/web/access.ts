import "server-only";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { admin } from "@/i18n/admin";
import type { StaffGate } from "@/modules/access";
import { StaffContext } from "@/modules/access/domain/StaffContext";
import { isPhoneEmail } from "@/modules/identity/domain/Login";
import type { Permission, RoleScope } from "@/shared/domain/permissions";
import { getCurrentUser, type User } from "./auth";
import { crmStaffAccess } from "./crm";

/**
 * Права сотрудника CRM на стороне веба (ADR 0013): роль, права и что мешает войти приходят из API v1 (`webCrmStaff`),
 * здесь — только редирект/404 для страниц и отказ для действий. Сами проверки повторяет mybook-api.
 */
export interface Staff {
  user: User;
  roleName: string;
  roleKey: string | null;
  scope: RoleScope;
  permissions: ReadonlySet<Permission>;
  /** Руководитель: все права, роль не ограничивает. */
  isOwner: boolean;
  context: StaffContext;
}

const FORBIDDEN_ERROR = Symbol.for("mybook.forbidden-error");

export class ForbiddenError extends Error {
  readonly [FORBIDDEN_ERROR] = true;
  constructor(message = "Недостаточно прав для этого действия") {
    super(message);
  }
  static is(err: unknown): err is ForbiddenError {
    return typeof err === "object" && err !== null && (err as Record<symbol, unknown>)[FORBIDDEN_ERROR] === true;
  }
}

const access = cache(async () => {
  const user = await getCurrentUser();
  if (!user) return null;
  const dto = await crmStaffAccess();
  if (!dto.staff) return null;
  const s = dto.staff;
  const context = new StaffContext(user.id, s.roleName, s.roleKey, s.scope, new Set(s.permissions as Permission[]), s.isOwner, { isPhoneEmail });
  const staff: Staff = { user, roleName: s.roleName, roleKey: s.roleKey, scope: s.scope, permissions: context.permissions, isOwner: s.isOwner, context };
  return { staff, gate: dto.gate as StaffGate };
});

const loadStaff = async (): Promise<Staff | null> => (await access())?.staff ?? null;
const staffGate = async (): Promise<StaffGate> => (await access())?.gate ?? null;

/** Текущий сотрудник, если его ничего не блокирует. */
export const getStaff = cache(async (): Promise<Staff | null> => {
  const a = await access();
  return a && !a.gate ? a.staff : null;
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

/** Для server actions: исключение без редиректа. */
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

export function staffViewer(staff: Staff) {
  return { userId: staff.user.id, seesAll: staff.scope === "all" };
}

export function canSeeClientRecords(staff: Staff, managerId: string | null | undefined, orderAssigneeId?: string | null) {
  return staff.context.ownsClient(managerId, orderAssigneeId);
}

export function canAssignOthers(staff: Staff) {
  return staff.context.canAssignOthers;
}

export function canWork(staff: Staff, assigneeId: string | null | undefined) {
  return staff.context.canWork(assigneeId);
}

export function workRefusal(staff: Staff, assigneeId: string | null | undefined): string | null {
  if (canWork(staff, assigneeId)) return null;
  return assigneeId ? admin.recordNotYours : admin.recordUnsorted;
}

export function contactView(staff: Staff, v: { phone?: string | null; email?: string | null }) {
  return staff.context.contacts(v);
}
