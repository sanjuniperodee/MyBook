import { maskEmail, maskPhone, type Permission, type RoleScope } from "./permissions";

/**
 * Кто действует в CRM и что ему можно. Неизменяемый объект: собирается из роли на каждый запрос.
 * Проверки прав — на сервере; скрытая кнопка в интерфейсе — не защита.
 */
export class StaffContext {
  constructor(
    readonly userId: string,
    readonly roleName: string,
    readonly roleKey: string | null,
    readonly scope: RoleScope,
    readonly permissions: ReadonlySet<Permission>,
    readonly isOwner: boolean,
  ) {}

  can(...perms: Permission[]) {
    return perms.every((p) => this.permissions.has(p));
  }

  /** Роль «только свои» видит свои записи и неразобранные (без ответственного). */
  canSee(assigneeId: string | null | undefined) {
    return this.scope === "all" || !assigneeId || assigneeId === this.userId;
  }

  get canAssignOthers() {
    return this.scope === "all";
  }

  /** Контакты клиента с учётом права clients.contacts. */
  contacts(v: { phone?: string | null; email?: string | null }) {
    const full = this.can("clients.contacts");
    return { phone: full ? (v.phone ?? "") : maskPhone(v.phone), email: full ? (v.email ?? "") : maskEmail(v.email), masked: !full };
  }
}
