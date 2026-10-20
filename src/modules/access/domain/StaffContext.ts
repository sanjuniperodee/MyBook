import type { Permission, RoleScope } from "@/shared/domain/permissions";
import { maskEmail, maskPhone } from "./permissions";

/** Формат логина клиента (контекст Identity): адрес-заглушка клиента без почты не считается контактом. */
export interface LoginFormat {
  isPhoneEmail(email: string | null | undefined): boolean;
}

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
    private readonly login: LoginFormat,
  ) {}

  can(...perms: Permission[]) {
    return perms.every((p) => this.permissions.has(p));
  }

  /** Роль «только свои» видит свои записи и неразобранные (без ответственного). */
  canSee(assigneeId: string | null | undefined) {
    return this.scope === "all" || !assigneeId || assigneeId === this.userId;
  }

  /** Менять запись: ответственный или роль «все записи». Неразобранные «только свои» видят, но себе не берут. */
  canWork(assigneeId: string | null | undefined) {
    return this.scope === "all" || (!!assigneeId && assigneeId === this.userId);
  }

  /**
   * Книги и заказы клиента: роль «только свои» — только своих клиентов (менеджер клиента — я), заказ — ещё и если я его
   * ответственный. Неразобранных клиентов не видит (в отличие от canSee для сделок и чатов).
   */
  ownsClient(managerId: string | null | undefined, orderAssigneeId?: string | null) {
    return this.scope === "all" || (!!managerId && managerId === this.userId) || (!!orderAssigneeId && orderAssigneeId === this.userId);
  }

  get canAssignOthers() {
    return this.scope === "all";
  }

  /** Контакты клиента с учётом права clients.contacts. */
  contacts(v: { phone?: string | null; email?: string | null }) {
    const full = this.can("clients.contacts");
    // Адрес-заглушка клиента без почты (@phone.invalid) — не контакт: показывать и подставлять в письма его не нужно.
    const email = this.login.isPhoneEmail(v.email) ? "" : v.email;
    return { phone: full ? (v.phone ?? "") : maskPhone(v.phone), email: full ? (email ?? "") : maskEmail(email), masked: !full };
  }
}
