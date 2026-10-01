import { DomainError } from "@/shared/domain";

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

export class OrderingError extends DomainError<OrderingErrorCode> {}
