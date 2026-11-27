import { Module } from "@nestjs/common";
import { SiteCallsController } from "./site-calls.controller";
import { SiteIntegrationsController } from "./site-integrations.controller";
import { SiteOpsBridge } from "./site-ops.bridge";
import { SitePaymentsController } from "./site-payments.controller";

/**
 * Контекст 7B (ADR 0014): последние 32 маршрута сайта — деньги (Kaspi, CloudPayments, оплаты, возвраты и чеки CRM,
 * файлы заказа), вебхуки интеграций и звонки WhatsApp. Выполняет их тот же обработчик сайта, что и mybook-api, через
 * мост `SiteOpsBridge` и порт `SITE_OPS_PORTS`: логика денег и проверки подписей — одна на оба процесса.
 */
@Module({
  controllers: [SitePaymentsController, SiteIntegrationsController, SiteCallsController],
  providers: [SiteOpsBridge],
})
export class SiteOpsModule {}
