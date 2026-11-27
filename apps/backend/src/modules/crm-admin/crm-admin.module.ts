import { Module } from "@nestjs/common";
import { CrmAdminController } from "./crm-admin.controller";
import { CrmCatalogController } from "./crm-catalog.controller";
import { CrmMarketingController } from "./crm-marketing.controller";

/**
 * Контекст 5A-2 («CRM-2, часть 2: каталог, маркетинг/ИИ-дизайнер и админка», ADR 0014):
 * все 35 контрактных маршрутов из `crmCatalogRoutes` (8), `crmMarketingRoutes` (15) и `crmAdminRoutes` (12).
 */
@Module({
  controllers: [CrmCatalogController, CrmMarketingController, CrmAdminController],
})
export class CrmAdminApiModule {}
