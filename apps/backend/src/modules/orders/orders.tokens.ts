import type { Output, Parsed } from "@mybook/contracts";
import type { FastifyRequest } from "fastify";
import type { Locale } from "@/i18n/config";
import type { BookRow } from "@/modules/authoring";
import type { CurrentUser } from "@/modules/identity";
import type { StaffMember } from "../../core/auth/staff";
import type { AppConfig } from "../../core/config/app-config";
import { sessionToken } from "../../core/auth/session";
import { clientIp } from "../../core/http/client-ip";
import { requestLocale } from "../../core/http/request";

/** Порт Контекста 7A («заказы и деньги API v1» — 47 маршрутов). */
export const ORDERS_API_PORTS = Symbol("OrdersApiPorts");

/** Маршруты контекста 7A — те же, что `ORDERS_API_ROUTES` общего кода (src/server/api-v1/orders.ts). */
export type OrdersApiRoute =
  | "cabinetCheckout"
  | "cabinetCheckoutQuote"
  | "cabinetOrderPlace"
  | "cabinetOrders"
  | "cabinetOrder"
  | "cabinetOrderKaspi"
  | "cabinetOrderKaspiStatus"
  | "cabinetOrderClaim"
  | "cabinetOrderCancel"
  | "webCheckoutPage"
  | "webPromoCheck"
  | "webOrderPlace"
  | "webOrdersList"
  | "webOrderDetail"
  | "webOrderLayoutApprove"
  | "webPayPage"
  | "webPayViewed"
  | "webPayClaim"
  | "crmOrderMoney"
  | "crmOrderPay"
  | "crmOrderRefund"
  | "crmOrderPaymentVoid"
  | "crmOrderPaymentReview"
  | "crmOrderPostpay"
  | "crmOrderTerms"
  | "crmOrderRepriceRequest"
  | "crmOrderDelivery"
  | "crmOrderFiles"
  | "crmOrderDetails"
  | "crmOrderDetailsUpdate"
  | "crmOrderLinks"
  | "crmOrderNote"
  | "crmOrderBookLock"
  | "crmFinance"
  | "crmFinanceReview"
  | "crmFinanceResolve"
  | "crmFinanceUndo"
  | "crmExpenses"
  | "crmExpenseAdd"
  | "crmExpenseUpdate"
  | "crmExpenseRemove"
  | "crmProfit"
  | "crmProfitFees"
  | "crmInvoiceForm"
  | "crmInvoiceIssue"
  | "crmInvoiceCancel"
  | "crmInvoiceResend";

/** Кто и откуда вызывает: вход уже проверен guard-ами (SessionGuard, StaffGuard, PermissionsGuard, BookAccessGuard). */
export interface OrdersCallMeta {
  user: CurrentUser | null;
  staff: StaffMember | null;
  token: string | null;
  ip: string;
  locale: Locale;
  /** Полный адрес запроса — маршрутам сайта с файлом чека (оплата, возврат). */
  url: string;
}

export interface OrdersApiPorts {
  /** Выполнить маршрут общим кодом (тем же, что у mybook-api): ответ контракта или готовый Response (отказ, 400/429). */
  run<K extends OrdersApiRoute>(meta: OrdersCallMeta, name: K, input: Parsed<K>, book?: BookRow | null): Promise<Output<K> | Response>;
}

/** Контекст вызова из запроса Fastify: пользователь и сотрудник — от guard-ов, токен, язык и IP — из заголовков. */
export function ordersCallMeta(req: FastifyRequest, config: AppConfig): OrdersCallMeta {
  return {
    user: req.user ?? null,
    staff: req.staff ?? null,
    token: sessionToken(req),
    ip: clientIp(req, config.edgeIpSecret),
    locale: requestLocale(req),
    url: new URL(req.url, config.appUrl).toString(),
  };
}
