import { contextError } from "@/shared/domain";

/**
 * Коды ошибок контекста заказов. Совпадают с ключами словарей checkout.errors / checkout.promo,
 * поэтому слой представления показывает текст на языке клиента без таблиц соответствий.
 */
export type OrderingErrorCode =
  | "bookNotFound"
  | "alreadyOrdered"
  | "notReady"
  | "promoGone"
  | "empty"
  | "notFound"
  | "expired"
  | "used"
  | "orderNotFound"
  | "invalidTransition"
  | "promoExists"
  | "giftNotFound"
  | "giftPastDate"
  | "giftNeedEmail"
  | "staffNotFound";

export const OrderingError = contextError<OrderingErrorCode>("ordering", "OrderingError");
export type OrderingError = InstanceType<typeof OrderingError>;
