import { dashboard } from "./infrastructure/Dashboard";
import { paymentsExport } from "./infrastructure/PaymentsExport";
import { myDay } from "./infrastructure/MyDay";
import { search } from "./infrastructure/Search";
import { clientBrief, dealById, dealCard } from "./infrastructure/DealCard";
import { clientById, clientCard } from "./infrastructure/ClientCard";
import { conversationContext, inbox } from "./infrastructure/Inbox";
import { callJournal, taskList } from "./infrastructure/Lists";
import { orderCrm, orderExport, orderList, productionBoard } from "./infrastructure/Orders";
import { dealList, savedViews, stageCounts } from "./infrastructure/Deals";
import { duplicateGroups } from "./infrastructure/Duplicates";
import { bookList } from "./infrastructure/Books";
import { salesAnalytics } from "./infrastructure/SalesAnalytics";
import { crmCounters } from "./infrastructure/Counters";
import { getLive } from "./infrastructure/Live";
import { queryClients, segmentCounts } from "./infrastructure/Clients";

/**
 * Отчёты CRM — сторона чтения (CQRS): сводные выборки по нескольким контекстам для страниц
 * (дашборд, аналитика, поиск, «Мой день»). Только чтение, без бизнес-правил: команды идут
 * через модули контекстов.
 */
export type { Viewer } from "./infrastructure/MyDay";
export type { OrderFilters } from "./infrastructure/Orders";
export type { CrmCounters } from "./infrastructure/Counters";
export type { LiveState } from "./infrastructure/Live";
export { STALLED_DAYS, type ClientSort } from "./infrastructure/Clients";

export class ReportingModule {
  readonly salesAnalytics = salesAnalytics;
  readonly dashboard = dashboard;
  readonly paymentsExport = paymentsExport;
  readonly myDay = myDay;
  readonly search = search;
  readonly dealById = dealById;
  readonly dealCard = dealCard;
  readonly clientBrief = clientBrief;
  readonly clientById = clientById;
  readonly clientCard = clientCard;
  readonly inbox = inbox;
  readonly conversationContext = conversationContext;
  readonly taskList = taskList;
  readonly callJournal = callJournal;
  readonly orderList = orderList;
  readonly orderExport = orderExport;
  readonly productionBoard = productionBoard;
  readonly orderCrm = orderCrm;
  readonly dealList = dealList;
  readonly savedViews = savedViews;
  readonly stageCounts = stageCounts;
  readonly duplicateGroups = duplicateGroups;
  readonly bookList = bookList;
  readonly counters = crmCounters;
  readonly live = getLive;
  readonly clients = queryClients;
  readonly segmentCounts = segmentCounts;
}
