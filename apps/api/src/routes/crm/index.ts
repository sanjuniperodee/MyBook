import type { Handlers } from "../../app";
import { crmChatHandlers } from "./chats";
import { crmClientHandlers } from "./clients";
import { crmDealHandlers } from "./deals";
import { crmNewClientHandlers } from "./new-client";
import { crmOrderFileHandlers } from "./order-files";
import { crmOrderHandlers } from "./orders";
import { crmSupportHandlers } from "./support";
import { crmFinanceHandlers } from "./finance";
import { crmAnalyticsHandlers } from "./analytics";
import { crmSettingsHandlers } from "./settings";
import { crmMarketingHandlers } from "./marketing";
import { crmBookHandlers } from "./books";
import { crmCatalogHandlers } from "./catalog";

const all = { ...crmDealHandlers, ...crmClientHandlers, ...crmChatHandlers, ...crmOrderHandlers, ...crmNewClientHandlers, ...crmOrderFileHandlers, ...crmSupportHandlers, ...crmFinanceHandlers, ...crmAnalyticsHandlers, ...crmSettingsHandlers, ...crmMarketingHandlers, ...crmBookHandlers, ...crmCatalogHandlers };

/** Обработчики CRM-маршрутов контракта (packages/contracts/src/v1/crm.ts). */
export const crmHandlers: Pick<Handlers, keyof typeof all> = all;
