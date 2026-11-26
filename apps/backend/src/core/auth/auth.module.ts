import { Global, Module } from "@nestjs/common";
import { SessionReader } from "@/modules/identity/application/SessionReader";
import { randomTokens } from "@/modules/identity/infrastructure/adapters";
import { DrizzleIdentityQueries } from "@/modules/identity/infrastructure/queries";
import type { Clock } from "@/shared/application";
import { CLOCK } from "../kernel/tokens";
import { SESSION_USERS } from "./session";

/** Сессии — сразу из контекста Identity (его чтение не зависит от старого контейнера). */
@Global()
@Module({
  providers: [{ provide: SESSION_USERS, useFactory: (clock: Clock) => new SessionReader(new DrizzleIdentityQueries(), randomTokens, clock), inject: [CLOCK] }],
  exports: [SESSION_USERS],
})
export class AuthModule {}
