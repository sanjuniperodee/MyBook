import type { StaffGate } from "@/modules/access";
import type { StaffContext } from "@/modules/access/domain/StaffContext";
import type { CurrentUser } from "@/modules/identity";
import type { Permission, RoleScope } from "@/shared/domain/permissions";

/** Авторизованный сотрудник CRM, проверенный StaffGuard (паритет со Staff в src/server/access.ts). */
export interface StaffMember {
  user: CurrentUser;
  roleName: string;
  roleKey: string | null;
  scope: RoleScope;
  permissions: ReadonlySet<Permission>;
  isOwner: boolean;
  context: StaffContext;
  gate: StaffGate;
}

export interface StaffResolution {
  context: StaffContext;
  gate: StaffGate;
}

/** Порт определения роли, прав и правил безопасности сотрудника (ip-allowlist, обязательная 2FA). */
export interface StaffAccessPort {
  resolve(user: CurrentUser, ip: string): Promise<StaffResolution | null>;
}

export const STAFF_ACCESS = Symbol("StaffAccess");
