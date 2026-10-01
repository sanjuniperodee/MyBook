/** Жизненный цикл заказа. Единственный источник списка статусов (схема БД берёт его отсюда). */
export const ORDER_STATUSES = ["pending_payment", "paid", "in_production", "shipped", "delivered", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const isOrderStatus = (v: string): v is OrderStatus => (ORDER_STATUSES as readonly string[]).includes(v);

/** Статусы, в которых заказ «живой»: книга заблокирована для правок. */
export const ACTIVE_ORDER_STATUSES: readonly OrderStatus[] = ["pending_payment", "paid", "in_production", "shipped", "delivered"];
