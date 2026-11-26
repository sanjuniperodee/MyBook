import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { AuthModule } from "./auth/auth.module";
import { PermissionsGuard } from "./auth/permissions.guard";
import { SessionGuard } from "./auth/session.guard";
import { StaffGuard } from "./auth/staff.guard";
import { ConfigModule } from "./config/config.module";
import { ApiExceptionFilter } from "./errors/api-exception.filter";
import { HealthController } from "./health/health.controller";
import { RouteRegistry, ROUTE_REGISTRY } from "./routes/route-registry";
import { RoutesController } from "./routes/routes.controller";
import { ContractInputGuard } from "./http/contract-input.guard";
import { ContractResponseInterceptor } from "./http/contract-response.interceptor";

/** Сквозное: настройки, вход, права сотрудника, контракт, формат ошибок, health. Бизнес-логики здесь нет. */
@Module({
  imports: [ConfigModule, AuthModule],
  controllers: [HealthController, RoutesController],
  providers: [
    { provide: ROUTE_REGISTRY, useValue: new RouteRegistry() },
    // Порядок глобальных guard-ов — паритет с mybook-api: вход → допуск сотрудника (роль/IP/2FA) →
    // разбор входа по контракту (400 до проверки прав) → конкретные @Permissions(...) контроллера.
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: StaffGuard },
    { provide: APP_GUARD, useClass: ContractInputGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: ContractResponseInterceptor },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class CoreModule {}
