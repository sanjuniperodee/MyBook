import type { Clock, Logger, UnitOfWork } from "@/shared/application";
import { canReview, FeedbackError, Review, THANK_YOU, type ReviewInput, type ReviewPhoto, type ReviewRepository } from "../domain";
import type { OrderLookup, PromoCodeGenerator, ReviewPhotoStore, StaffAlerts, ThankYouPromos } from "./ports";

export type ModerationAction = "publish" | "hide" | "feature" | "unfeature";

/** Фото в отзыве: новое (файл), убрать или оставить как есть. */
export type PhotoChange = { file: Buffer } | "remove" | "keep";

/** Отзывы клиентов: оставить и поправить отзыв, поблагодарить автора, проверить и показать на сайте. */
export class ReviewsService {
  constructor(
    private readonly reviews: ReviewRepository,
    private readonly orders: OrderLookup,
    private readonly photos: ReviewPhotoStore,
    private readonly promos: ThankYouPromos,
    private readonly promoCode: PromoCodeGenerator,
    private readonly alerts: StaffAlerts,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  /** Заказ, к которому можно оставить отзыв, и уже оставленный отзыв (если есть). */
  async open(orderId: string) {
    const order = await this.orders.forReview(orderId);
    if (!order || !canReview(order)) throw new FeedbackError("reviewNotAllowed");
    return { order, review: await this.reviews.byOrder(orderId) };
  }

  /**
   * Новый отзыв или правка своего. Первый отзыв по заказу приносит автору промокод, а низкая оценка
   * сразу уходит поддержке — оба шага после фиксации: их сбой не должен терять отзыв.
   */
  async submit(orderId: string, input: ReviewInput, photo: PhotoChange = "keep") {
    const { order, review: existing } = await this.open(orderId);
    if (existing && existing.status !== "new") throw new FeedbackError("reviewLocked");
    if (typeof photo === "object" && photo.file.length > this.photos.maxBytes) throw new FeedbackError("reviewPhotoInvalid");

    const stored: ReviewPhoto | null | undefined = typeof photo === "object" ? await this.photos.save(orderId, photo.file) : photo === "remove" ? null : undefined;
    const previousPhoto = existing?.photo ?? null;
    const now = this.clock.now();
    const review = await this.uow.run(async () => {
      const r = existing ?? Review.submit(this.reviews.nextId(), input, { orderId, userId: order.userId, locale: order.locale, theme: order.theme }, now);
      if (existing) r.revise(input, now);
      if (stored !== undefined) r.attachPhoto(stored, now);
      await this.reviews.save(r);
      this.uow.track(r);
      return r;
    });
    if (stored !== undefined && previousPhoto && previousPhoto.key !== stored?.key) await this.photos.remove(previousPhoto.key).catch((err) => this.logger.error("photo cleanup", err));

    if (!existing) {
      await this.thank(review, order.number);
      if (review.isLow)
        await this.alerts
          .lowRating({ reviewId: review.id, orderNumber: order.number, rating: review.rating, text: review.text, authorName: review.authorName })
          .catch((err) => this.logger.error("low rating alert", err));
    }
    return review;
  }

  /** Промокод-благодарность: код случайный, при редком совпадении пробуем ещё. */
  private async thank(review: Review, orderNumber: number) {
    for (let attempt = 0; attempt < 3 && !review.thankYouCode; attempt++) {
      const code = await this.promos
        .issue({ code: this.promoCode(), percent: THANK_YOU.percent, validHours: THANK_YOU.validDays * 24, note: `Спасибо за отзыв к заказу №${orderNumber}` })
        .catch((err) => {
          this.logger.error("thank-you promo", err);
          return null;
        });
      if (code) {
        review.thank(code);
        await this.reviews.save(review);
      }
    }
  }

  /** Модерация в CRM. */
  async moderate(reviewId: string, action: ModerationAction) {
    return this.uow.run(async () => {
      const review = await this.reviews.byId(reviewId);
      if (!review) throw new FeedbackError("reviewNotFound");
      const now = this.clock.now();
      if (action === "publish") review.publish(now);
      else if (action === "hide") review.hide(now);
      else review.feature(action === "feature", now);
      await this.reviews.save(review);
      return review;
    });
  }
}
