import type { Clock, SettingsReader } from "@/shared/application";
import { storeTimeZone } from "@/shared/domain/time";
import { LandingService, MarketingService, type PromoIssuer } from "./application";
import { crmMarketingSettings, personalPromoCode, siteLinks, type MarketingSettingKey } from "./infrastructure/adapters";
import { drizzleClientContext, drizzleLandingVisits, drizzleLinks, drizzleSpend, sqlReportSource } from "./infrastructure/persistence";

export { type VisitAttribution } from "./application";
export { conversion, costPerLead, romi, type ChatOffers, type OfferRequest, type Report } from "./domain";

/** Публичный фасад контекста «Маркетинг»: каналы привлечения, короткие ссылки, предложения из чата. */
export class MarketingModule {
  readonly service: MarketingService;
  readonly links = drizzleLinks;
  /** Расходы на рекламу по каналам (analytics-7). */
  readonly spend = drizzleSpend;
  /** Переходы на рекламные лендинги и привязка к ним новых диалогов WhatsApp. */
  readonly landing: LandingService;

  constructor(deps: { clock: Clock; promos: PromoIssuer; settings: SettingsReader<MarketingSettingKey> }) {
    this.service = new MarketingService(sqlReportSource, drizzleLinks, drizzleClientContext, deps.promos, personalPromoCode, crmMarketingSettings(deps.settings), siteLinks, deps.clock);
    this.landing = new LandingService(drizzleLandingVisits, deps.clock, storeTimeZone);
  }
}
