import type { OrderStatus } from "@/shared/domain/orders";

/** Статусы оплаченного заказа: оплачен, в печати, отправлен или доставлен. */
export const PAID_ORDER_STATUSES = ["paid", "in_production", "shipped", "delivered"] as const satisfies readonly OrderStatus[];

/**
 * Заказ оплачен — по статусу: не ждёт оплаты и не отменён. От этого зависят файлы книги для покупателя, отзыв
 * и шаг «Заказ» в кабинете. Выручка считается иначе — по paid_at (см. paidAndNotCancelled в SQL модулей).
 */
export const isPaid = (status: OrderStatus) => (PAID_ORDER_STATUSES as readonly OrderStatus[]).includes(status);
