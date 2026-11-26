import type { OrderDetailsView } from "@/modules/ordering";
import type { StaffAlerts, ThankYouPromos } from "@/modules/feedback";

/** Фасад контекста Feedback (src/modules/feedback), собранный с портами этого процесса. */
export const FEEDBACK = Symbol("Feedback");

/** Порты Feedback из других контекстов: промокод-благодарность (Ordering) и сигнал сотрудникам (Workspace). */
export const FEEDBACK_PORTS = Symbol("FeedbackPorts");
export interface FeedbackPorts {
  promos: ThankYouPromos;
  alerts: StaffAlerts;
}

/** Заказ глазами HTTP-слоя отзывов: чей он, номер и книга (обложка и вид книги в надписях). */
export const REVIEW_ORDERS = Symbol("ReviewOrders");
export type ReviewOrder = Pick<OrderDetailsView, "userId" | "number" | "book">;
export interface ReviewOrders {
  find(orderId: string): Promise<ReviewOrder | null>;
}
