/** Правила отзывов: кто может оставить отзыв, что можно показывать на сайте, благодарность автору. */

export const RATING_MIN = 1;
export const RATING_MAX = 5;
export const TEXT_MAX = 2000;
export const NAME_MAX = 40;
export const CITY_MAX = 40;
/** Короче — в оценку идёт, но на сайте не показывается: «Супер!» ничего не рассказывает покупателю. */
export const PUBLIC_TEXT_MIN = 20;
/** Оценка, при которой отзыв сразу уходит поддержке: клиента нужно услышать, пока он не ушёл расстроенным. */
export const LOW_RATING = 3;
/** Благодарность за любой отзыв (не только за хороший): персональная скидка на следующую книгу. */
export const THANK_YOU = { percent: 10, validDays: 60 } as const;
/** Сводная оценка на сайте — только когда отзывов достаточно, чтобы она что-то значила. */
export const AGGREGATE_MIN_COUNT = 5;

/** Заказ глазами отзывов. */
export interface ReviewableOrder {
  status: string;
  plan: string;
  paid: boolean;
}

/**
 * Отзыв можно оставить, когда книга у клиента: печатную — после отправки, электронную — сразу
 * после оплаты. Неоплаченный и отменённый заказы отзывов не дают.
 */
export function canReview(order: ReviewableOrder): boolean {
  if (!order.paid || order.status === "cancelled" || order.status === "pending_payment") return false;
  return order.status === "shipped" || order.status === "delivered" || order.plan === "digital";
}

/** Средняя оценка с одним знаком после запятой; честная — по всем отзывам, а не только по показанным. */
export function ratingSummary(ratings: readonly number[]): { average: number; count: number } {
  if (!ratings.length) return { average: 0, count: 0 };
  const sum = ratings.reduce((a, b) => a + b, 0);
  return { average: Math.round((sum / ratings.length) * 10) / 10, count: ratings.length };
}
