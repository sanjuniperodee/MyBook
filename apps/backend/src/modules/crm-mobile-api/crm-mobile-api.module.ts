import { Module } from "@nestjs/common";
import { CrmChatsOpsController } from "./crm-chats-ops.controller";
import { CrmDealsOpsController } from "./crm-deals-ops.controller";
import { CrmTasksOpsController } from "./crm-tasks-ops.controller";
import { CrmWorkController } from "./crm-work.controller";

/**
 * Контекст 4B («CRM-1: мобильный API v1», ADR 0014): все 44 контрактных маршрута из `crmMobileRestRoutes`
 * (профиль/смена/обзор, личные шаблоны, звонки, каталог WhatsApp, чаты и сообщения, сделки, задачи, статус заказа).
 */
@Module({
  controllers: [CrmWorkController, CrmChatsOpsController, CrmDealsOpsController, CrmTasksOpsController],
})
export class CrmMobileApiModule {}
