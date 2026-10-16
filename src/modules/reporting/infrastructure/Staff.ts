import type { Permission, RoleScope } from "@/shared/domain/permissions";

/**
 * Сотрудник глазами отчётов: кто он, чьи записи видит и что ему открыто. Контекст прав из Access
 * подходит структурно — отчёты не импортируют чужой модуль.
 */
export interface StaffView {
  userId: string;
  scope: RoleScope;
  can(...perms: Permission[]): boolean;
  /** Контакты клиента с учётом права clients.contacts (без права — скрыты). */
  contacts(v: { phone?: string | null; email?: string | null }): { phone: string; email: string };
}
