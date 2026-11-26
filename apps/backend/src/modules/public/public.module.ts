import { Module } from "@nestjs/common";
import { PublicService } from "./public.service";
import { SitePublicController } from "./site-public.controller";
import { WebPublicController } from "./web-public.controller";

/**
 * Контекст 3 («Публичное и маркетинг», ADR 0014): 13 контрактных маршрутов `/api/v1/web/*` и
 * 10 маршрутов сайта (`@SiteRoute`: PDF сертификата, письма близких, фото/отправка отзыва,
 * онлайн-чат и обратный звонок, iCal-лента, аватар WhatsApp, `/r/{code}`, `/go/{slug}`).
 */
@Module({
  controllers: [WebPublicController, SitePublicController],
  providers: [PublicService],
})
export class PublicApiModule {}
