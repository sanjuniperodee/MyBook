/**
 * Деньги в приложении CRM: «Финансы», «Расходы», «Прибыль». Права — здесь, сам маршрут — общий код
 * src/server/api-v1/orders.ts (модели тех же функций экранов сайта; его же зовёт Nest).
 */
import { apiStaff } from "@/server/api";
import { ORDERS_API_PERMISSIONS as P, ordersApi } from "@/server/api-v1/orders";
import type { Handlers } from "../../app";

export const crmFinanceHandlers: Pick<Handlers, "crmFinance" | "crmFinanceReview" | "crmFinanceResolve" | "crmFinanceUndo" | "crmExpenses" | "crmExpenseAdd" | "crmExpenseUpdate" | "crmExpenseRemove" | "crmProfit" | "crmProfitFees"> = {
  async crmFinance({ req, input }) {
    return ordersApi.crmFinance({ input, staff: await apiStaff(req, ...P.crmFinance), user: null, book: null, req });
  },
  async crmFinanceReview({ req, input }) {
    return ordersApi.crmFinanceReview({ input, staff: await apiStaff(req, ...P.crmFinanceReview), user: null, book: null, req });
  },
  async crmFinanceResolve({ req, input }) {
    return ordersApi.crmFinanceResolve({ input, staff: await apiStaff(req, ...P.crmFinanceResolve), user: null, book: null, req });
  },
  async crmFinanceUndo({ req, input }) {
    return ordersApi.crmFinanceUndo({ input, staff: await apiStaff(req, ...P.crmFinanceUndo), user: null, book: null, req });
  },
  async crmExpenses({ req, input }) {
    return ordersApi.crmExpenses({ input, staff: await apiStaff(req, ...P.crmExpenses), user: null, book: null, req });
  },
  async crmExpenseAdd({ req, input }) {
    return ordersApi.crmExpenseAdd({ input, staff: await apiStaff(req, ...P.crmExpenseAdd), user: null, book: null, req });
  },
  async crmExpenseUpdate({ req, input }) {
    return ordersApi.crmExpenseUpdate({ input, staff: await apiStaff(req, ...P.crmExpenseUpdate), user: null, book: null, req });
  },
  async crmExpenseRemove({ req, input }) {
    return ordersApi.crmExpenseRemove({ input, staff: await apiStaff(req, ...P.crmExpenseRemove), user: null, book: null, req });
  },
  async crmProfit({ req, input }) {
    return ordersApi.crmProfit({ input, staff: await apiStaff(req, ...P.crmProfit), user: null, book: null, req });
  },
  async crmProfitFees({ req, input }) {
    return ordersApi.crmProfitFees({ input, staff: await apiStaff(req, ...P.crmProfitFees), user: null, book: null, req });
  },
};
