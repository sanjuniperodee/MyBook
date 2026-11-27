/**
 * Заказ в приложении CRM: деньги (оплата с чеком, возврат, отмена и сверка платежа, постоплата, тариф и цена, просьба
 * руководителю) и доставка. Права — здесь, сам маршрут — общий код src/server/api-v1/orders.ts (его же зовёт Nest).
 */
import { apiStaff } from "@/server/api";
import { ORDERS_API_PERMISSIONS as P, ordersApi } from "@/server/api-v1/orders";
import type { Handlers } from "../../app";

export const crmOrderHandlers: Pick<Handlers, "crmOrderMoney" | "crmOrderPay" | "crmOrderRefund" | "crmOrderPaymentVoid" | "crmOrderPaymentReview" | "crmOrderPostpay" | "crmOrderTerms" | "crmOrderRepriceRequest" | "crmOrderDelivery"> = {
  async crmOrderMoney({ req, input }) {
    return ordersApi.crmOrderMoney({ input, staff: await apiStaff(req, ...P.crmOrderMoney), user: null, book: null, req });
  },
  // Права проверяет маршрут сайта с чеком (/api/admin/orders/<id>/…) — как раньше.
  async crmOrderPay({ req, input }) {
    return ordersApi.crmOrderPay({ input, staff: null, user: null, book: null, req });
  },
  // Права проверяет маршрут сайта с чеком (/api/admin/orders/<id>/…) — как раньше.
  async crmOrderRefund({ req, input }) {
    return ordersApi.crmOrderRefund({ input, staff: null, user: null, book: null, req });
  },
  async crmOrderPaymentVoid({ req, input }) {
    return ordersApi.crmOrderPaymentVoid({ input, staff: await apiStaff(req, ...P.crmOrderPaymentVoid), user: null, book: null, req });
  },
  async crmOrderPaymentReview({ req, input }) {
    return ordersApi.crmOrderPaymentReview({ input, staff: await apiStaff(req, ...P.crmOrderPaymentReview), user: null, book: null, req });
  },
  async crmOrderPostpay({ req, input }) {
    return ordersApi.crmOrderPostpay({ input, staff: await apiStaff(req, ...P.crmOrderPostpay), user: null, book: null, req });
  },
  async crmOrderTerms({ req, input }) {
    return ordersApi.crmOrderTerms({ input, staff: await apiStaff(req, ...P.crmOrderTerms), user: null, book: null, req });
  },
  async crmOrderRepriceRequest({ req, input }) {
    return ordersApi.crmOrderRepriceRequest({ input, staff: await apiStaff(req, ...P.crmOrderRepriceRequest), user: null, book: null, req });
  },
  async crmOrderDelivery({ req, input }) {
    return ordersApi.crmOrderDelivery({ input, staff: await apiStaff(req, ...P.crmOrderDelivery), user: null, book: null, req });
  },
};
