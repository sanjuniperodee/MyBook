import { dashboard } from "./infrastructure/Dashboard";
import { myDay } from "./infrastructure/MyDay";
import { search } from "./infrastructure/Search";
import { clientBrief, dealById, dealCard } from "./infrastructure/DealCard";
import { clientById, clientCard } from "./infrastructure/ClientCard";
import { salesAnalytics } from "./infrastructure/SalesAnalytics";

/**
 * Отчёты CRM — сторона чтения (CQRS): сводные выборки по нескольким контекстам для страниц
 * (дашборд, аналитика, поиск, «Мой день»). Только чтение, без бизнес-правил: команды идут
 * через модули контекстов.
 */
export type { Viewer } from "./infrastructure/MyDay";

export class ReportingModule {
  readonly salesAnalytics = salesAnalytics;
  readonly dashboard = dashboard;
  readonly myDay = myDay;
  readonly search = search;
  readonly dealById = dealById;
  readonly dealCard = dealCard;
  readonly clientBrief = clientBrief;
  readonly clientById = clientById;
  readonly clientCard = clientCard;
}
