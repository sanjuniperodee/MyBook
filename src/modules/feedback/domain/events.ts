import { domainEvent, type DomainEvent } from "@/shared/domain";

/** Клиент оставил отзыв (впервые по этому заказу). */
export type ReviewSubmitted = DomainEvent<"feedback.review_submitted", { reviewId: string; orderId: string; userId: string; rating: number }>;

export type FeedbackEvent = ReviewSubmitted;

export const FeedbackEvents = {
  reviewSubmitted: (p: ReviewSubmitted["payload"]): ReviewSubmitted => domainEvent("feedback.review_submitted", p),
};
