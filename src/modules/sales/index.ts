import type { Clock, Logger, SettingsReader, UnitOfWork, WorkSchedule } from "@/shared/application";
import { DealsService, PipelinesService, SiteFunnelService } from "./application";
import { crmSalesSettings, drizzleClients, roundRobinRouter, sqlBookProgress, type SalesSettingKey } from "./infrastructure/adapters";
import { agreementForClient } from "./infrastructure/agreements";
import { setClientDealsAttribution } from "./infrastructure/attribution";
import { dealAgreedPlan, setDealAgreedPlan } from "./infrastructure/agreedPlan";
import { DealPayments } from "./infrastructure/payments";
import { DealReceipts } from "./infrastructure/receipts";
import { DrizzleDealRepository, DrizzleFunnelRepository, DrizzlePipelineRepository, DrizzleSalesQueries, DrizzleSavedViews, drizzlePlans } from "./infrastructure/persistence";

export { currentMonth, shiftMonth, type PlanProgress, sourceFromChannel, type DealCreated, type DealStageChanged, type DealAssigned, type SalesEvent } from "./domain";
export type { DealView, NewDeal } from "./application";
export type { ReceiptRow } from "./infrastructure/receipts";
export type { DealAgreement } from "./infrastructure/agreements";
export type { PaymentRow } from "./infrastructure/payments";
export { MAX_PAYMENT, PaymentError, RECEIPT_MAX_BYTES, ReceiptError } from "./domain";

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
  /** Договорённая цена и предоплата клиента по ручной сделке — их применяет оформление заказа. */
  readonly agreementFor = agreementForClient;
  /** Тариф договорённости по сделке: клиент оформляет заказ именно на него. */
  readonly agreedPlan = { set: setDealAgreedPlan, get: dealAgreedPlan };
  /** Перенести вручную выбранный канал клиента на его сделки (у которых нет настоящих UTM-меток). */
  readonly setClientAttribution = setClientDealsAttribution;

  /** Настройки CRM и график работы (распределение заявок по кругу) — порты рабочего пространства. */
  constructor(deps: { uow: UnitOfWork; clock: Clock; logger: Logger; settings: SettingsReader<SalesSettingKey>; schedule: WorkSchedule }) {
    const repo = new DrizzleDealRepository();
    const funnels = new DrizzleFunnelRepository();
    const settings = crmSalesSettings(deps.settings);
    this.deals = new DealsService(repo, funnels, drizzleClients, settings, roundRobinRouter(deps.schedule), deps.uow, deps.clock);
    this.pipelines = new PipelinesService(new DrizzlePipelineRepository(), () => this.deals.defaultPipelineId());
    this.funnel = new SiteFunnelService(repo, funnels, drizzleClients, settings, sqlBookProgress, this.deals, deps.logger, (dealId) => this.payments.paidTotal(dealId));
  }
}
