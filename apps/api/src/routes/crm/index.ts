import type { Handlers } from "../../app";
import { crmChatHandlers } from "./chats";
import { crmClientHandlers } from "./clients";
import { crmDealHandlers } from "./deals";

/** Обработчики CRM-маршрутов контракта (packages/contracts/src/v1/crm.ts). */
export const crmHandlers: Pick<Handlers, keyof typeof crmDealHandlers | keyof typeof crmClientHandlers | keyof typeof crmChatHandlers> = { ...crmDealHandlers, ...crmClientHandlers, ...crmChatHandlers };
