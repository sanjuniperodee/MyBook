import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { AuthModule } from "./auth/auth.module";
import { SessionGuard } from "./auth/session.guard";
import { ConfigModule } from "./config/config.module";
import { ApiExceptionFilter } from "./errors/api-exception.filter";
import { HealthController } from "./health/health.controller";
import { ContractInterceptor } from "./http/contract.interceptor";

/** Сквозное: настройки, вход, контракт, формат ошибок, health. Бизнес-логики здесь нет. */
@Module({
  imports: [ConfigModule, AuthModule],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_INTERCEPTOR, useClass: ContractInterceptor },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class CoreModule {}
