import type { Clock, SettingsReader } from "@/shared/application";
import { MarketingService, type PromoIssuer } from "./application";
import { crmMarketingSettings, personalPromoCode, siteLinks, type MarketingSettingKey } from "./infrastructure/adapters";
import { drizzleClientContext, drizzleLinks, drizzleSpend, sqlReportSource } from "./infrastructure/persistence";

export { conversion, costPerLead, romi, type ChatOffers, type OfferRequest, type Report } from "./domain";

/** Публичный фасад контекста «Маркетинг»: каналы привлечения, короткие ссылки, предложения из чата. */
export class MarketingModule {
  readonly service: MarketingService;
  readonly links = drizzleLinks;
  /** Расходы на рекламу по каналам (analytics-7). */
  readonly spend = drizzleSpend;

  constructor(deps: { clock: Clock; promos: PromoIssuer; settings: SettingsReader<MarketingSettingKey> }) {
    this.service = new MarketingService(sqlReportSource, drizzleLinks, drizzleClientContext, deps.promos, personalPromoCode, crmMarketingSettings(deps.settings), siteLinks, deps.clock);
  }
}
