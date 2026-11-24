import type { OrderStatus } from "@/shared/domain/orders";

export interface TrackStep {
  status: OrderStatus;
  label: string;
}

/** Подписи этапов — orders.order.steps из словаря. */
export interface TrackLabels {
  placed: string;
  paid: string;
  printing: string;
  shipping: string;
  delivered: string;
  ready: string;
}

/**
 * Этапы заказа по порядку. Печатная книга: оформлен, оплачен, печатается, в пути, доставлен. Электронная: оформлен,
 * готов к скачиванию (оплата сразу даёт файлы).
 */
export function orderSteps(printed: boolean, s: TrackLabels): TrackStep[] {
  return printed
    ? [
        { status: "pending_payment", label: s.placed },
        { status: "paid", label: s.paid },
        { status: "in_production", label: s.printing },
        { status: "shipped", label: s.shipping },
        { status: "delivered", label: s.delivered },
      ]
    : [
        { status: "pending_payment", label: s.placed },
        { status: "paid", label: s.ready },
      ];
}

/** Ключ для текста «что сейчас» (orders.order.now): у оплаченной электронной книги — «ready», а не «paid». */
export const nowKey = (status: OrderStatus, printed: boolean) => (status === "paid" && !printed ? "ready" : status);
