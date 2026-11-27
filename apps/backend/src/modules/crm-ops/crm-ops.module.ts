import { Module } from "@nestjs/common";
import { BoardsController } from "./boards.controller";
import { CrmAnalyticsSettingsController } from "./crm-analytics-settings.controller";
import { CrmSecurityController } from "./crm-security.controller";
import { CrmSupportBooksController } from "./crm-support-books.controller";
import { WebCrmController } from "./web-crm.controller";

/**
 * Контекст 5A-1 («CRM-2, часть 1»): 45 контрактных маршрутов API v1 —
 * доски задач (19), веб-CRM (3), книги и поддержка (6), аналитика и настройки (7), роли и 2FA (10).
 */
@Module({
  controllers: [
    BoardsController,
    WebCrmController,
    CrmSupportBooksController,
    CrmAnalyticsSettingsController,
    CrmSecurityController,
  ],
})
export class CrmOpsApiModule {}
