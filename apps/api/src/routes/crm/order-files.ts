/**
 * Файлы заказа для типографии, данные заказа, связи, заметка и правка книги в приложении CRM. Права — здесь, сам
 * маршрут — общий код src/server/api-v1/orders.ts (его же зовёт Nest).
 */
import { apiStaff } from "@/server/api";
import { ORDERS_API_PERMISSIONS as P, ordersApi } from "@/server/api-v1/orders";
import type { Handlers } from "../../app";

export const crmOrderFileHandlers: Pick<Handlers, "crmOrderFiles" | "crmOrderBookLock" | "crmOrderDetails" | "crmOrderDetailsUpdate" | "crmOrderLinks" | "crmOrderNote"> = {
  async crmOrderFiles({ req, input }) {
    return ordersApi.crmOrderFiles({ input, staff: await apiStaff(req, ...P.crmOrderFiles), user: null, book: null, req });
  },
  async crmOrderBookLock({ req, input }) {
    return ordersApi.crmOrderBookLock({ input, staff: await apiStaff(req, ...P.crmOrderBookLock), user: null, book: null, req });
  },
  async crmOrderDetails({ req, input }) {
    return ordersApi.crmOrderDetails({ input, staff: await apiStaff(req, ...P.crmOrderDetails), user: null, book: null, req });
  },
  async crmOrderDetailsUpdate({ req, input }) {
    return ordersApi.crmOrderDetailsUpdate({ input, staff: await apiStaff(req, ...P.crmOrderDetailsUpdate), user: null, book: null, req });
  },
  async crmOrderLinks({ req, input }) {
    return ordersApi.crmOrderLinks({ input, staff: await apiStaff(req, ...P.crmOrderLinks), user: null, book: null, req });
  },
  async crmOrderNote({ req, input }) {
    return ordersApi.crmOrderNote({ input, staff: await apiStaff(req, ...P.crmOrderNote), user: null, book: null, req });
  },
};
