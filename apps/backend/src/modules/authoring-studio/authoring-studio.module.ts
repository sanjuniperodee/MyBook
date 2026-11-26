import { Module } from "@nestjs/common";
import { IdentityApiModule } from "../identity/identity.module";
import { AnswerFilesController } from "./answer-files.controller";
import { PagesController } from "./pages.controller";

/**
 * Контекст 2B («Authoring: студия полос и медиа/файлы ответов», 19 маршрутов API v1, ADR 0014):
 * - «Страницы», студия оформления полос, ИИ-дизайнер страниц и «Главы книги» (8 маршрутов);
 * - QR-медиа ответов, загрузка своих видео/аудио кусками и покупка пакетов минут через Kaspi (11 маршрутов).
 * Проверку доступа к книге переиспользует из `IdentityApiModule` (`BookAccessGuard`), порты приходят из `LegacyModule`.
 */
@Module({
  imports: [IdentityApiModule],
  controllers: [PagesController, AnswerFilesController],
})
export class AuthoringStudioApiModule {}
