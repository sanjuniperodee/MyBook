import "server-only";
import type { SettingsStore } from "@/shared/application";
import { RoleService, SecurityService, StaffResolver, TeamService, type AccountGateway, type AuditLog, type RequestOrigin } from "./application";
import type { LoginFormat } from "./domain";
import { randomPasswords, settingsSecurityStore, type AccessSettingKey } from "./infrastructure/adapters";
import { DrizzleAccessQueries, DrizzleRoleRepository, DrizzleStaffRepository, drizzleAuditLog, drizzleShifts } from "./infrastructure/persistence";

export * from "./domain";
export type { StaffAccount } from "./application";

/** Публичный фасад контекста Access: сотрудники, роли и права, правила безопасности, журнал. */
export class AccessModule {
  readonly resolver: StaffResolver;
  readonly team: TeamService;
  readonly roles: RoleService;
  readonly security: SecurityService;
  readonly audit: AuditLog;
  readonly queries = new DrizzleAccessQueries();
  readonly shifts = drizzleShifts;

  /** accounts и login — порты Identity (учётные записи, формат логина); origin — адрес запроса для журнала. */
  constructor(deps: { accounts: AccountGateway; login: LoginFormat; origin: RequestOrigin; settings: SettingsStore<AccessSettingKey> }) {
    const roles = new DrizzleRoleRepository();
    const security = settingsSecurityStore(deps.settings);
    this.audit = drizzleAuditLog(deps.origin);
    this.resolver = new StaffResolver(roles, security, deps.login);
    this.team = new TeamService(new DrizzleStaffRepository(), roles, deps.accounts, randomPasswords, this.audit);
    this.roles = new RoleService(roles, this.audit);
    this.security = new SecurityService(security, this.audit);
  }
}
