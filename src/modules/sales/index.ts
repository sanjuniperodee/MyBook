import type { Clock, Logger, UnitOfWork } from "@/shared/application";
import { DealsService, PipelinesService, SiteFunnelService } from "./application";
import { crmSalesSettings, drizzleClients, roundRobinRouter, sqlBookProgress } from "./infrastructure/adapters";
import { DealPayments } from "./infrastructure/payments";
import { DealReceipts } from "./infrastructure/receipts";
import { DrizzleDealRepository, DrizzleFunnelRepository, DrizzlePipelineRepository, DrizzleSalesQueries, DrizzleSavedViews, drizzlePlans } from "./infrastructure/persistence";

export { currentMonth, shiftMonth, type PlanProgress, dealSourceLabels, dealSources, sourceFromChannel, SalesError, type DealCreated, type DealStageChanged, type DealAssigned, type SalesEvent, type CustomValues, type DealSource, type StageMilestone } from "./domain";
export type { DealView, NewDeal } from "./application";
export { ReceiptError, type ReceiptRow } from "./infrastructure/receipts";
export { MAX_PAYMENT, PaymentError, type PaymentRow } from "./infrastructure/payments";
export { RECEIPT_MAX_BYTES } from "./domain";

/** Публичный фасад контекста «Продажи»: сделки, воронки, этапы, дубли, воронка по действиям на сайте. */
export class SalesModule {
  readonly deals: DealsService;
  readonly funnel: SiteFunnelService;
  readonly queries = new DrizzleSalesQueries();
  readonly pipelines: PipelinesService;
  readonly savedViews = new DrizzleSavedViews();
  readonly plans = drizzlePlans;
  /** Чеки об оплате по сделкам (файлы и метаданные). */
  readonly receipts = new DealReceipts();
  /** Принятые деньги по сделкам, оформленным вручную (предоплата, доплаты) — источник выручки наряду с заказами. */
  readonly payments = new DealPayments();

  constructor(deps: { uow: UnitOfWork; clock: Clock; logger: Logger }) {
    const repo = new DrizzleDealRepository();
    const funnels = new DrizzleFunnelRepository();
    this.deals = new DealsService(repo, funnels, drizzleClients, crmSalesSettings, roundRobinRouter, deps.uow, deps.clock);
    this.pipelines = new PipelinesService(new DrizzlePipelineRepository(), () => this.deals.defaultPipelineId());
    this.funnel = new SiteFunnelService(repo, funnels, drizzleClients, crmSalesSettings, sqlBookProgress, this.deals, deps.logger);
  }
}
