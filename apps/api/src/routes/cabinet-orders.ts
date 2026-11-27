/**
 * Заказ и оплата для приложения «MyBooks»: вход и книга — здесь (apiBook), сам маршрут — общий код
 * src/server/api-v1/orders.ts (его же зовёт бэкенд на Nest).
 */
import { apiBook } from "@/server/api";
import { ordersApi } from "@/server/api-v1/orders";
import type { Handlers } from "../app";

type Route = "cabinetCheckout" | "cabinetCheckoutQuote" | "cabinetOrderPlace" | "cabinetOrders" | "cabinetOrder" | "cabinetOrderKaspi" | "cabinetOrderKaspiStatus" | "cabinetOrderClaim" | "cabinetOrderCancel";

export const cabinetOrderHandlers: Pick<Handlers, Route> = {
  async cabinetCheckout({ req, user, input }) {
    const { book } = await apiBook(req, input.bookId);
    return ordersApi.cabinetCheckout({ input, staff: null, user: user!, book, req });
  },
  async cabinetCheckoutQuote({ req, user, input }) {
    const { book } = await apiBook(req, input.bookId);
    return ordersApi.cabinetCheckoutQuote({ input, staff: null, user: user!, book, req });
  },
  async cabinetOrderPlace({ req, user, input }) {
    const { book } = await apiBook(req, input.bookId);
    return ordersApi.cabinetOrderPlace({ input, staff: null, user: user!, book, req });
  },
  async cabinetOrders({ req, user, input }) {
    return ordersApi.cabinetOrders({ input, staff: null, user: user!, book: null, req });
  },
  async cabinetOrder({ req, user, input }) {
    return ordersApi.cabinetOrder({ input, staff: null, user: user!, book: null, req });
  },
  async cabinetOrderKaspi({ req, user, input }) {
    return ordersApi.cabinetOrderKaspi({ input, staff: null, user: user!, book: null, req });
  },
  async cabinetOrderKaspiStatus({ req, user, input }) {
    return ordersApi.cabinetOrderKaspiStatus({ input, staff: null, user: user!, book: null, req });
  },
  async cabinetOrderClaim({ req, user, input }) {
    return ordersApi.cabinetOrderClaim({ input, staff: null, user: user!, book: null, req });
  },
  async cabinetOrderCancel({ req, user, input }) {
    return ordersApi.cabinetOrderCancel({ input, staff: null, user: user!, book: null, req });
  },
};
