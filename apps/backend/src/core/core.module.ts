import { Inject, Module, type OnModuleInit } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, ModulesContainer, Reflector } from "@nestjs/core";
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
import { SiteResponseInterceptor } from "./http/site-response.interceptor";
import { SITE_ROUTE_REGISTRY, siteRouteOf, SiteRouteRegistry } from "./http/site-route";
import { SiteRouteShadowGuard } from "./http/site-route-shadow.guard";

/** Сквозное: настройки, вход, права сотрудника, контракт, маршруты сайта, формат ошибок, health. Бизнес-логики здесь нет. */
@Module({
  imports: [ConfigModule, AuthModule],
  controllers: [HealthController, RoutesController],
  providers: [
    { provide: ROUTE_REGISTRY, useFactory: () => new RouteRegistry() },
    { provide: SITE_ROUTE_REGISTRY, useFactory: () => new SiteRouteRegistry() },
    // Порядок глобальных guard-ов — паритет с mybook-api: вход → допуск сотрудника (роль/IP/2FA) →
    // разбор входа по контракту (400 до проверки прав) → конкретные @Permissions(...) контроллера. Первым — выбор
    // маршрута сайта: адрес более точного шаблона без этого метода — 405, как у mybook-api (SiteRouteShadowGuard).
    { provide: APP_GUARD, useClass: SiteRouteShadowGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: StaffGuard },
    { provide: APP_GUARD, useClass: ContractInputGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: ContractResponseInterceptor },
    { provide: APP_INTERCEPTOR, useClass: SiteResponseInterceptor },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class CoreModule implements OnModuleInit {
  constructor(
    @Inject(ModulesContainer) private readonly modules: ModulesContainer,
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(SITE_ROUTE_REGISTRY) private readonly siteRoutes: SiteRouteRegistry,
  ) {}

  /** Регистрирует все @SiteRoute текущего приложения для корректных ответов 405 Method Not Allowed. */
  onModuleInit() {
    for (const mod of this.modules.values()) {
      for (const wrapper of mod.controllers.values()) {
        const instance: unknown = wrapper.instance;
        if (typeof instance !== "object" || instance === null) continue;
        const proto = Object.getPrototypeOf(instance) as object;
        for (const key of Object.getOwnPropertyNames(proto)) {
          if (key === "constructor") continue;
          const handler = Reflect.get(proto, key);
          if (typeof handler === "function") {
            const meta = siteRouteOf(this.reflector, handler);
            if (meta) this.siteRoutes.add(meta.method, meta.path);
          }
        }
      }
    }
  }
}
