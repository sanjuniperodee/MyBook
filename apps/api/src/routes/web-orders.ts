/**
 * Оформление заказа, заказы и оплата по ссылке для веба в API v1 (ADR 0012, Раздел 3, section: "orders"): вход и книга —
 * здесь, сам маршрут — общий код src/server/api-v1/orders.ts (его же зовёт бэкенд на Nest).
 */
import { apiBook } from "@/server/api";
import { ordersApi } from "@/server/api-v1/orders";
import { getCurrentUser } from "@/server/auth";
import type { Handlers } from "../app";

type Route = "webCheckoutPage" | "webPromoCheck" | "webOrderPlace" | "webOrdersList" | "webOrderDetail" | "webOrderLayoutApprove" | "webPayPage" | "webPayViewed" | "webPayClaim";

export const webOrdersHandlers: Pick<Handlers, Route> = {
  async webCheckoutPage({ req, user, input }) {
    const { book } = await apiBook(req, input.bookId);
    return ordersApi.webCheckoutPage({ input, staff: null, user: user!, book, req });
  },
  async webPromoCheck({ req, user, input }) {
    return ordersApi.webPromoCheck({ input, staff: null, user: user!, book: null, req });
  },
  async webOrderPlace({ req, user, input }) {
    return ordersApi.webOrderPlace({ input, staff: null, user: user!, book: null, req });
  },
  async webOrdersList({ req, user, input }) {
    return ordersApi.webOrdersList({ input, staff: null, user: user!, book: null, req });
  },
  async webOrderDetail({ req, user, input }) {
    return ordersApi.webOrderDetail({ input, staff: null, user: user!, book: null, req });
  },
  async webOrderLayoutApprove({ req, user, input }) {
    return ordersApi.webOrderLayoutApprove({ input, staff: null, user: user!, book: null, req });
  },
  async webPayPage({ req, input }) {
    return ordersApi.webPayPage({ input, staff: null, user: null, book: null, req });
  },
  // Ссылку оплаты открывают без входа; сотрудник, открывший её из CRM, — не «клиент посмотрел».
  async webPayViewed({ req, input }) {
    return ordersApi.webPayViewed({ input, staff: null, user: await getCurrentUser(), book: null, req });
  },
  async webPayClaim({ req, input }) {
    return ordersApi.webPayClaim({ input, staff: null, user: null, book: null, req });
  },
};
