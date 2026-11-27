/**
 * CRM — счета сделки в API v1 (перенос /api/mobile/invoices*): права — здесь, сам маршрут — общий код
 * src/server/api-v1/orders.ts (те же действия, что у формы счёта в CRM на сайте).
 */
import { apiStaff } from "@/server/api";
import { ORDERS_API_PERMISSIONS as P, ordersApi } from "@/server/api-v1/orders";
import type { Handlers } from "../app";

export const crmInvoiceHandlers: Pick<Handlers, "crmInvoiceForm" | "crmInvoiceIssue" | "crmInvoiceCancel" | "crmInvoiceResend"> = {
  async crmInvoiceForm({ req, input }) {
    return ordersApi.crmInvoiceForm({ input, staff: await apiStaff(req, ...P.crmInvoiceForm), user: null, book: null, req });
  },
  async crmInvoiceIssue({ req, input }) {
    return ordersApi.crmInvoiceIssue({ input, staff: await apiStaff(req, ...P.crmInvoiceIssue), user: null, book: null, req });
  },
  async crmInvoiceCancel({ req, input }) {
    return ordersApi.crmInvoiceCancel({ input, staff: await apiStaff(req, ...P.crmInvoiceCancel), user: null, book: null, req });
  },
  async crmInvoiceResend({ req, input }) {
    return ordersApi.crmInvoiceResend({ input, staff: await apiStaff(req, ...P.crmInvoiceResend), user: null, book: null, req });
  },
};
