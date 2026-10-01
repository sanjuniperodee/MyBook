import type { Clock, Logger, UnitOfWork } from "@/shared/application";
import { DealsService, SiteFunnelService } from "./application";
import { crmSalesSettings, drizzleClients, roundRobinRouter, sqlBookProgress } from "./infrastructure/adapters";
import { DrizzleDealRepository, DrizzleFunnelRepository, DrizzleSalesQueries } from "./infrastructure/persistence";

export { currentMonth, shiftMonth, type PlanProgress, dealSourceLabels, sourceFromChannel, SalesError, type DealCreated, type DealStageChanged, type DealAssigned, type SalesEvent, type CustomValues, type DealSource, type StageMilestone } from "./domain";
export type { DealView, NewDeal } from "./application";

/** Публичный фасад контекста «Продажи»: сделки, воронки, этапы, дубли, воронка по действиям на сайте. */
export class SalesModule {
  readonly deals: DealsService;
  readonly funnel: SiteFunnelService;
  readonly queries = new DrizzleSalesQueries();

  constructor(deps: { uow: UnitOfWork; clock: Clock; logger: Logger }) {
    const repo = new DrizzleDealRepository();
    const funnels = new DrizzleFunnelRepository();
    this.deals = new DealsService(repo, funnels, drizzleClients, crmSalesSettings, roundRobinRouter, deps.uow, deps.clock);
    this.funnel = new SiteFunnelService(repo, funnels, drizzleClients, crmSalesSettings, sqlBookProgress, this.deals, deps.logger);
  }
}
