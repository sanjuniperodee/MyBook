import { domainEvent, type DomainEvent } from "@/shared/domain";
import type { OrderStatus } from "@/shared/domain/orders";
import type { DealInvoiceEvent } from "./DealInvoice";

/** Минимальный «публичный» снимок заказа для подписчиков других контекстов. */
export interface OrderRef {
  orderId: string;
  number: number;
  userId: string;
  bookId: string;
  plan: string;
  /** К оплате сейчас (за вычетом предоплаты, внесённой по договорённости). */
  amount: number;
  /** Внесённая ранее предоплата: цена заказа целиком — amount + prepaid. */
  prepaid: number;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  promoCode: string | null;
}

/**
 * agreementDealId — сделка, договорённость которой применилась (цена, предоплата): заказ привязывается к ней.
 * prepaidExcess — внесено по договорённости больше итога заказа: столько нужно вернуть (подписчик ставит задачу ответственному).
 */
export type OrderPlaced = DomainEvent<"ordering.order_placed", OrderRef & { estimatedPages: number; quantity: number; agreementDealId?: string | null; prepaidExcess?: number; /** Стоимость доставки рассчитывается индивидуально — менеджеру задача. */ deliveryQuoted?: { method: string; country: string | null; city: string | null }; /** Прежние события: доставка в другую страну. */ deliveryAbroad?: { country: string | null; city: string | null } }>;
/** settled — заказ на постоплате: деньги пришли после печати (файлы уже готовы, выручка — с даты оплаты). */
export type OrderPaid = DomainEvent<"ordering.order_paid", OrderRef & { paymentId: string | null; actor: string; settled?: boolean }>;
/** По заказу получено больше, чем к оплате (или деньги по отменённому): нужен возврат или зачёт. */
export type OrderOverpaid = DomainEvent<"ordering.order_overpaid", OrderRef & { overpaid: number; method: string }>;
/** Заказ на постоплате доставлен, а оплата получена не полностью — ответственному задача «получить постоплату». */
export type PostpayDue = DomainEvent<"ordering.postpay_due", OrderRef & { outstanding: number }>;
export type OrderStatusChanged = DomainEvent<"ordering.order_status_changed", OrderRef & { from: OrderStatus; to: OrderStatus; trackingNumber: string | null; actor: string }>;
export type OrderCancelled = DomainEvent<"ordering.order_cancelled", OrderRef & { wasPaid: boolean; releasedPromo: boolean; actor: string }>;
export type PaymentClaimed = DomainEvent<"ordering.payment_claimed", OrderRef>;
export type GiftCardPurchased = DomainEvent<"ordering.gift_purchased", { giftId: string }>;
export type GiftCardPaid = DomainEvent<"ordering.gift_paid", { giftId: string; actor: string }>;
export type GiftPaymentClaimed = DomainEvent<"ordering.gift_payment_claimed", { giftId: string }>;

export type OrderingEvent = DealInvoiceEvent | OrderPlaced | OrderPaid | OrderOverpaid | PostpayDue | OrderStatusChanged | OrderCancelled | PaymentClaimed | GiftCardPurchased | GiftCardPaid | GiftPaymentClaimed;

export const OrderingEvents = {
  orderPlaced: (p: OrderPlaced["payload"]): OrderPlaced => domainEvent("ordering.order_placed", p),
  orderPaid: (p: OrderPaid["payload"]): OrderPaid => domainEvent("ordering.order_paid", p),
  orderOverpaid: (p: OrderOverpaid["payload"]): OrderOverpaid => domainEvent("ordering.order_overpaid", p),
  postpayDue: (p: PostpayDue["payload"]): PostpayDue => domainEvent("ordering.postpay_due", p),
  statusChanged: (p: OrderStatusChanged["payload"]): OrderStatusChanged => domainEvent("ordering.order_status_changed", p),
  orderCancelled: (p: OrderCancelled["payload"]): OrderCancelled => domainEvent("ordering.order_cancelled", p),
  paymentClaimed: (p: PaymentClaimed["payload"]): PaymentClaimed => domainEvent("ordering.payment_claimed", p),
  giftPurchased: (p: GiftCardPurchased["payload"]): GiftCardPurchased => domainEvent("ordering.gift_purchased", p),
  giftPaid: (p: GiftCardPaid["payload"]): GiftCardPaid => domainEvent("ordering.gift_paid", p),
  giftPaymentClaimed: (p: GiftPaymentClaimed["payload"]): GiftPaymentClaimed => domainEvent("ordering.gift_payment_claimed", p),
};
