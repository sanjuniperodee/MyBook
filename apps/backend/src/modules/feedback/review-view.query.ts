import { Inject, Injectable } from "@nestjs/common";
import { REVIEW_MAX, type Output } from "@mybook/contracts";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { coverImagePath } from "@/lib/book/cover-image-version";
import { bookKind } from "@/lib/content/kinds";
import { FeedbackError, type FeedbackModule as FeedbackContext } from "@/modules/feedback";
import { reviewLabels, toReviewDto } from "@/modules/feedback/ui/reviewView";
import { ApiError } from "../../core/errors/api-error";
import { FEEDBACK, REVIEW_ORDERS, type ReviewOrders } from "./feedback.tokens";

/** Экран отзыва к заказу: можно ли оставить, свой отзыв, обложка и надписи на языке клиента. */
@Injectable()
export class ReviewViewQuery {
  constructor(
    @Inject(FEEDBACK) private readonly feedback: FeedbackContext,
    @Inject(REVIEW_ORDERS) private readonly orders: ReviewOrders,
  ) {}

  async view(orderId: string, locale: Locale): Promise<Output<"reviewGet">> {
    const order = await this.orders.find(orderId);
    if (!order) throw new ApiError(404, "reviewNotFound");
    const screen = {
      coverUrl: coverImagePath(order.book, 480),
      labels: reviewLabels(messagesFor(locale).review, order.number, bookKind(order.book.theme)),
      limits: { ...REVIEW_MAX },
    };
    try {
      const { order: reviewable, review } = await this.feedback.reviews.open(orderId);
      return { canReview: true, defaultName: reviewable.name, review: review ? toReviewDto(review) : null, ...screen };
    } catch (err) {
      if (!FeedbackError.is(err) || err.code !== "reviewNotAllowed") throw err;
      return { canReview: false, defaultName: "", review: null, ...screen };
    }
  }
}
