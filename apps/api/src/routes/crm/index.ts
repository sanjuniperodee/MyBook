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
import { crmDealExtraHandlers } from "./deal-extras";
import { crmAdminHandlers } from "./admin";
import { crmKpHandlers } from "./kp";
import { crmSecurityHandlers } from "./security";
import { crmMobileRestHandlers } from "./mobile-rest";

const all = { ...crmDealHandlers, ...crmClientHandlers, ...crmChatHandlers, ...crmKpHandlers, ...crmSecurityHandlers, ...crmOrderHandlers, ...crmNewClientHandlers, ...crmOrderFileHandlers, ...crmSupportHandlers, ...crmFinanceHandlers, ...crmAnalyticsHandlers, ...crmSettingsHandlers, ...crmMarketingHandlers, ...crmBookHandlers, ...crmCatalogHandlers, ...crmDealExtraHandlers, ...crmAdminHandlers, ...crmMobileRestHandlers };

/** Обработчики CRM-маршрутов контракта (packages/contracts/src/v1/crm.ts). */
export const crmHandlers: Pick<Handlers, keyof typeof all> = all;
