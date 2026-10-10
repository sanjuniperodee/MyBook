import { domainEvent, type DomainEvent } from "@/shared/domain";
import type { OrderStatus } from "./OrderStatus";

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

export type OrderPlaced = DomainEvent<"ordering.order_placed", OrderRef & { estimatedPages: number; quantity: number }>;
export type OrderPaid = DomainEvent<"ordering.order_paid", OrderRef & { paymentId: string | null; actor: string }>;
export type OrderStatusChanged = DomainEvent<"ordering.order_status_changed", OrderRef & { from: OrderStatus; to: OrderStatus; trackingNumber: string | null; actor: string }>;
export type OrderCancelled = DomainEvent<"ordering.order_cancelled", OrderRef & { wasPaid: boolean; releasedPromo: boolean; actor: string }>;
export type PaymentClaimed = DomainEvent<"ordering.payment_claimed", OrderRef>;
export type GiftCardPurchased = DomainEvent<"ordering.gift_purchased", { giftId: string }>;
export type GiftCardPaid = DomainEvent<"ordering.gift_paid", { giftId: string; actor: string }>;
export type GiftPaymentClaimed = DomainEvent<"ordering.gift_payment_claimed", { giftId: string }>;

export type OrderingEvent = OrderPlaced | OrderPaid | OrderStatusChanged | OrderCancelled | PaymentClaimed | GiftCardPurchased | GiftCardPaid | GiftPaymentClaimed;

export const OrderingEvents = {
  orderPlaced: (p: OrderPlaced["payload"]): OrderPlaced => domainEvent("ordering.order_placed", p),
  orderPaid: (p: OrderPaid["payload"]): OrderPaid => domainEvent("ordering.order_paid", p),
  statusChanged: (p: OrderStatusChanged["payload"]): OrderStatusChanged => domainEvent("ordering.order_status_changed", p),
  orderCancelled: (p: OrderCancelled["payload"]): OrderCancelled => domainEvent("ordering.order_cancelled", p),
  paymentClaimed: (p: PaymentClaimed["payload"]): PaymentClaimed => domainEvent("ordering.payment_claimed", p),
  giftPurchased: (p: GiftCardPurchased["payload"]): GiftCardPurchased => domainEvent("ordering.gift_purchased", p),
  giftPaid: (p: GiftCardPaid["payload"]): GiftCardPaid => domainEvent("ordering.gift_paid", p),
  giftPaymentClaimed: (p: GiftPaymentClaimed["payload"]): GiftPaymentClaimed => domainEvent("ordering.gift_payment_claimed", p),
};
