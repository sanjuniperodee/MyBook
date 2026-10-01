import "server-only";
import type { Clock, OneTimeStepStore, UnitOfWork } from "@/shared/application";
import { AccountService, AuthService } from "./application";
import { appSecretCipher, bcryptHasher, envAdminEmails, randomTokens, resetMailer } from "./infrastructure/adapters";
import { DrizzlePasswordResetRepository, DrizzleSessionRepository, DrizzleUserRepository } from "./infrastructure/persistence";
import { DrizzleIdentityQueries } from "./infrastructure/queries";

export * from "./domain";
export type { LoginResult } from "./application";
export { SESSION_TTL_DAYS } from "./application";
export type { CurrentUser } from "./infrastructure/queries";

/** Публичный фасад контекста Identity: учётные записи, вход, пароли, второй фактор. */
export class IdentityModule {
  readonly auth: AuthService;
  readonly accounts: AccountService;
  readonly queries = new DrizzleIdentityQueries();
  readonly tokens = randomTokens;
  readonly passwords = bcryptHasher;

  constructor(deps: { uow: UnitOfWork; clock: Clock; steps: OneTimeStepStore }) {
    const users = new DrizzleUserRepository();
    this.auth = new AuthService(users, new DrizzleSessionRepository(), new DrizzlePasswordResetRepository(), bcryptHasher, randomTokens, appSecretCipher, resetMailer, envAdminEmails, deps.uow, deps.clock, deps.steps);
    this.accounts = new AccountService(users, this.auth, bcryptHasher, appSecretCipher, deps.uow, deps.clock);
  }
}
