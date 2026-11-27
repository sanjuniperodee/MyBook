import { Module } from "@nestjs/common";
import { IdentityApiModule } from "../identity/identity.module";
import { CabinetOrdersController } from "./cabinet-orders.controller";
import { CrmFinanceController } from "./crm-finance.controller";
import { CrmOrdersController } from "./crm-orders.controller";
import { WebOrdersController } from "./web-orders.controller";

/**
 * Контекст 7A («заказы и деньги API v1», ADR 0014): 46 контрактных маршрутов — кабинет (9), веб (8), заказ в CRM (15),
 * финансы и счета (14). Маршруты выполняет общий код `src/server/api-v1/orders.ts` (его же зовёт mybook-api) через
 * порт `ORDERS_API_PORTS`; проверку книги переиспользует из `IdentityApiModule` (`BookAccessGuard`).
 */
@Module({
  imports: [IdentityApiModule],
  controllers: [CabinetOrdersController, WebOrdersController, CrmOrdersController, CrmFinanceController],
})
export class OrdersApiModule {}
