import { Module } from "@nestjs/common";
import { CrmBoardsSupportSiteController } from "./crm-boards-support.site-controller";
import { CrmChatsSiteController } from "./crm-chats.site-controller";
import { CrmExportsSiteController } from "./crm-exports.site-controller";
import { CrmLiveCatalogSiteController } from "./crm-live-catalog.site-controller";

/**
 * Контекст 5B («CRM-2: 28 не-денежных маршрутов сайта `@SiteRoute`»):
 * чаты и материалы бота (7), доски/вложения/поддержка (5), каталог (2),
 * live/SSE/уведомления/push/упаковка (5) и выгрузки CSV/vCard (9).
 */
@Module({
  controllers: [
    CrmChatsSiteController,
    CrmBoardsSupportSiteController,
    CrmLiveCatalogSiteController,
    CrmExportsSiteController,
  ],
})
export class CrmSiteModule {}
