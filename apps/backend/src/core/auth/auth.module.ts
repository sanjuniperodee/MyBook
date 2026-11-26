import { Global, Module } from "@nestjs/common";
import { StaffResolver } from "@/modules/access/application/services";
import { settingsSecurityStore } from "@/modules/access/infrastructure/adapters";
import { DrizzleRoleRepository } from "@/modules/access/infrastructure/persistence";
import { isPhoneEmail } from "@/modules/identity/domain/Login";
import { SessionReader } from "@/modules/identity/application/SessionReader";
import { randomTokens } from "@/modules/identity/infrastructure/adapters";
import { DrizzleIdentityQueries } from "@/modules/identity/infrastructure/queries";
import { WorkspaceModule } from "@/modules/workspace";
import type { Clock } from "@/shared/application";
import { CLOCK } from "../kernel/tokens";
import { SESSION_USERS } from "./session";
import { STAFF_ACCESS, type StaffAccessPort } from "./staff";

function buildStaffAccess(): StaffAccessPort {
  const resolver = new StaffResolver(new DrizzleRoleRepository(), settingsSecurityStore(new WorkspaceModule().settings), { isPhoneEmail });
  return {
    async resolve(user, ip) {
      const account = {
        id: user.id,
        role: user.role,
        staffDisabled: user.staffDisabled,
        crmRoleId: user.crmRoleId,
        twoFactorEnabled: !!user.totpEnabledAt && !!user.totpSecret,
      };
      const context = await resolver.resolve(account);
      if (!context) return null;
      const gate = await resolver.gate(account, ip);
      return { context, gate };
    },
  };
}

/** Сессии и права сотрудников — напрямую из контекстов Identity и Access (без старого контейнера). */
@Global()
@Module({
  providers: [
    { provide: SESSION_USERS, useFactory: (clock: Clock) => new SessionReader(new DrizzleIdentityQueries(), randomTokens, clock), inject: [CLOCK] },
    { provide: STAFF_ACCESS, useFactory: buildStaffAccess },
  ],
  exports: [SESSION_USERS, STAFF_ACCESS],
})
export class AuthModule {}
