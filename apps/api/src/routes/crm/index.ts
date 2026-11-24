import type { Handlers } from "../../app";
import { crmChatHandlers } from "./chats";
import { crmClientHandlers } from "./clients";
import { crmDealHandlers } from "./deals";
import { crmOrderHandlers } from "./orders";

/** Обработчики CRM-маршрутов контракта (packages/contracts/src/v1/crm.ts). */
export const crmHandlers: Pick<Handlers, keyof typeof crmDealHandlers | keyof typeof crmClientHandlers | keyof typeof crmChatHandlers | keyof typeof crmOrderHandlers> = { ...crmDealHandlers, ...crmClientHandlers, ...crmChatHandlers, ...crmOrderHandlers };
