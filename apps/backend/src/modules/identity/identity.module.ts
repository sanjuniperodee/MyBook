import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { BookAccessGuard, BookAccessService } from "./book-access.guard";
import { CabinetController } from "./cabinet.controller";
import { MeController } from "./me.controller";
import { WebCabinetController } from "./web-cabinet.controller";

/**
 * Контекст 1 («Identity и кабинет», 33 маршрута API v1, ADR 0014):
 * аутентификация, профиль и удаление аккаунта, push-устройства клиента и CRM, веб-кабинет и экраны кабинета приложения.
 * Все порты смежных контекстов приходят из LegacyModule без обращений к `next/headers`.
 */
@Module({
  controllers: [AuthController, MeController, WebCabinetController, CabinetController],
  providers: [BookAccessService, BookAccessGuard],
  exports: [BookAccessService, BookAccessGuard],
})
export class IdentityApiModule {}
