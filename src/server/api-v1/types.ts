/**
 * Общие типы маршрутов заказов и денег API v1 (контекст 7A): список маршрутов, вызов и ответ-отказ.
 */
import type { Output, Parsed } from "@mybook/contracts";
import type { BookRow } from "@/modules/authoring";
import type { Staff } from "@/server/access";
import type { User } from "@/shared/infrastructure/db/schema";

/** Маршруты контекста 7A — все 47. */
export const ORDERS_API_ROUTES = [
  "cabinetCheckout",
  "cabinetCheckoutQuote",
  "cabinetOrderPlace",
  "cabinetOrders",
  "cabinetOrder",
  "cabinetOrderKaspi",
  "cabinetOrderKaspiStatus",
  "cabinetOrderClaim",
  "cabinetOrderCancel",
  "webCheckoutPage",
  "webPromoCheck",
  "webOrderPlace",
  "webOrdersList",
  "webOrderDetail",
  "webOrderLayoutApprove",
  "webPayPage",
  "webPayViewed",
  "webPayClaim",
  "crmOrderMoney",
  "crmOrderPay",
  "crmOrderRefund",
  "crmOrderPaymentVoid",
  "crmOrderPaymentReview",
  "crmOrderPostpay",
  "crmOrderTerms",
  "crmOrderRepriceRequest",
  "crmOrderDelivery",
  "crmOrderFiles",
  "crmOrderDetails",
  "crmOrderDetailsUpdate",
  "crmOrderLinks",
  "crmOrderNote",
  "crmOrderBookLock",
  "crmFinance",
  "crmFinanceReview",
  "crmFinanceResolve",
  "crmFinanceUndo",
  "crmExpenses",
  "crmExpenseAdd",
  "crmExpenseUpdate",
  "crmExpenseRemove",
  "crmProfit",
  "crmProfitFees",
  "crmInvoiceForm",
  "crmInvoiceIssue",
  "crmInvoiceCancel",
  "crmInvoiceResend",
] as const;

export type OrdersApiRoute = (typeof ORDERS_API_ROUTES)[number];

/**
 * Вызов маршрута: вход контракта, кто вызывает (сотрудник или клиент — уже проверены), книга маршрута (её проверил
 * apiBook или BookAccessGuard) и запрос — адрес и заголовок Authorization для маршрутов сайта с файлом чека.
 */
export interface OrdersApiCall<K extends OrdersApiRoute> {
  input: Parsed<K>;
  staff: Staff | null;
  user: User | null;
  book: BookRow | null;
  req: Request;
}

/** Обработчики маршрутов из списка K: вход — вызов, выход — ответ контракта или готовый Response. */
export type OrdersApiHandlers<K extends OrdersApiRoute> = { [R in K]: (call: OrdersApiCall<R>) => Promise<Output<R> | Response> };

/** Отказ действия (чужая запись, лимит скидки, заказ уже есть) — 400 с текстом для сотрудника. */
export const refused = (message: string) => Response.json({ error: message, code: "refused" }, { status: 400, headers: { "cache-control": "no-store" } });
