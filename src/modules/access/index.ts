import "server-only";
import { RoleService, SecurityService, StaffResolver, TeamService, type AccountGateway } from "./application";
import { randomPasswords, settingsSecurityStore } from "./infrastructure/adapters";
import { DrizzleAccessQueries, DrizzleRoleRepository, DrizzleStaffRepository, drizzleAuditLog, drizzleShifts } from "./infrastructure/persistence";

export * from "./domain";
export type { StaffAccount } from "./application";

/** Публичный фасад контекста Access: сотрудники, роли и права, правила безопасности, журнал. */
export class AccessModule {
  readonly resolver: StaffResolver;
  readonly team: TeamService;
  readonly roles: RoleService;
  readonly security: SecurityService;
  readonly audit = drizzleAuditLog;
  readonly queries = new DrizzleAccessQueries();
  readonly shifts = drizzleShifts;

  constructor(deps: { accounts: AccountGateway }) {
    const roles = new DrizzleRoleRepository();
    this.resolver = new StaffResolver(roles, settingsSecurityStore);
    this.team = new TeamService(new DrizzleStaffRepository(), roles, deps.accounts, randomPasswords, drizzleAuditLog);
    this.roles = new RoleService(roles, drizzleAuditLog);
    this.security = new SecurityService(settingsSecurityStore, drizzleAuditLog);
  }
}
