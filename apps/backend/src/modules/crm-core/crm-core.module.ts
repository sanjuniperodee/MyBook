import { Module } from "@nestjs/common";
import { CrmChatsController } from "./crm-chats.controller";
import { CrmClientsController } from "./crm-clients.controller";
import { CrmDealsController } from "./crm-deals.controller";
import { CrmListsController } from "./crm-lists.controller";

/** Контекст 4A («CRM-1: списки, сделки, клиенты, чаты и КП — 37 контрактных маршрутов API v1»). */
@Module({
  controllers: [CrmListsController, CrmDealsController, CrmClientsController, CrmChatsController],
})
export class CrmCoreApiModule {}
