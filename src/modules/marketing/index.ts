import type { Clock } from "@/shared/application";
import { MarketingService, type PromoIssuer } from "./application";
import { crmMarketingSettings, personalPromoCode, siteLinks } from "./infrastructure/adapters";
import { drizzleClientContext, drizzleLinks, sqlReportSource } from "./infrastructure/persistence";

export { conversion, type ChatOffers, type OfferRequest, type Report } from "./domain";

/** Публичный фасад контекста «Маркетинг»: каналы привлечения, короткие ссылки, предложения из чата. */
export class MarketingModule {
  readonly service: MarketingService;
  readonly links = drizzleLinks;

  constructor(deps: { clock: Clock; promos: PromoIssuer }) {
    this.service = new MarketingService(sqlReportSource, drizzleLinks, drizzleClientContext, deps.promos, personalPromoCode, crmMarketingSettings, siteLinks, deps.clock);
  }
}
