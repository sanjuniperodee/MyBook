import { DrizzleOrderingQueries } from "@/modules/ordering/infrastructure/persistence/DrizzleOrderingQueries";
import type { ReviewOrders } from "./feedback.tokens";

/** Заказы — чтение из контекста Ordering (его запросы не зависят от старого контейнера). */
export function orderingReviewOrders(queries = new DrizzleOrderingQueries()): ReviewOrders {
  return { find: async (orderId) => (await queries.orderDetails(orderId)) ?? null };
}
