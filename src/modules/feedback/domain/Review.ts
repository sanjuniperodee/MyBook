import { AggregateRoot } from "@/shared/domain";
import type { Locale } from "@/i18n/config";
import { FeedbackError } from "./errors";
import { FeedbackEvents } from "./events";
import { CITY_MAX, LOW_RATING, NAME_MAX, PUBLIC_TEXT_MIN, RATING_MAX, RATING_MIN, TEXT_MAX } from "./rules";

/** new — ждёт модерации, published — на сайте, hidden — только в CRM (в сводную оценку всё равно входит). */
export type ReviewStatus = "new" | "published" | "hidden";

export interface ReviewPhoto {
  key: string;
  width: number;
  height: number;
}

export interface ReviewInput {
  rating: number;
  text: string;
  authorName: string;
  city: string;
  /** Согласие показать отзыв на сайте (с именем и городом). */
  consent: boolean;
}

export interface ReviewProps extends ReviewInput {
  orderId: string;
  userId: string;
  locale: Locale;
  /** Тема книги — подпись «Книга маме» у отзыва. */
  theme: string;
  photo: ReviewPhoto | null;
  status: ReviewStatus;
  featured: boolean;
  /** Персональный промокод-благодарность; выдаётся один раз. */
  thankYouCode: string | null;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
}

function clean(input: ReviewInput): ReviewInput {
  const rating = Number(input.rating);
  if (!Number.isInteger(rating) || rating < RATING_MIN || rating > RATING_MAX) throw new FeedbackError("reviewInvalid", "rating out of range");
  const text = input.text.trim().replace(/\n{3,}/g, "\n\n");
  const authorName = input.authorName.trim().replace(/\s+/g, " ");
  const city = input.city.trim().replace(/\s+/g, " ");
  if (text.length > TEXT_MAX || !authorName || authorName.length > NAME_MAX || city.length > CITY_MAX) throw new FeedbackError("reviewInvalid");
  return { rating, text, authorName, city, consent: !!input.consent };
}

/**
 * Отзыв клиента о книге — один на заказ. Пока сотрудник не проверил отзыв, автор может его
 * поправить; на сайт попадает только отзыв с согласием и содержательным текстом.
 */
export class Review extends AggregateRoot<ReviewProps> {
  static restore(id: string, props: ReviewProps) {
    return new Review(id, props);
  }

  static submit(id: string, input: ReviewInput, order: { orderId: string; userId: string; locale: Locale; theme: string }, now: Date) {
    const review = new Review(id, {
      ...clean(input),
      ...order,
      photo: null,
      status: "new",
      featured: false,
      thankYouCode: null,
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
    });
    review.record(FeedbackEvents.reviewSubmitted({ reviewId: id, orderId: order.orderId, userId: order.userId, rating: review.props.rating }));
    return review;
  }

  get orderId() {
    return this.props.orderId;
  }
  get rating() {
    return this.props.rating;
  }
  get text() {
    return this.props.text;
  }
  get authorName() {
    return this.props.authorName;
  }
  get status() {
    return this.props.status;
  }
  get photo() {
    return this.props.photo;
  }
  get thankYouCode() {
    return this.props.thankYouCode;
  }
  /** Низкая оценка — повод для поддержки связаться с клиентом. */
  get isLow() {
    return this.props.rating <= LOW_RATING;
  }
  /** Можно ли показать на сайте: есть согласие и текст, который о чём-то рассказывает. */
  get isPublishable() {
    return this.props.consent && this.props.text.length >= PUBLIC_TEXT_MIN;
  }

  /** Автор правит отзыв, пока его не проверили. */
  revise(input: ReviewInput, now: Date) {
    if (this.props.status !== "new") throw new FeedbackError("reviewLocked");
    this.props = { ...this.props, ...clean(input), updatedAt: now };
  }

  /** Новое фото (или null — убрать). Прежний файл удаляет вызывающий. */
  attachPhoto(photo: ReviewPhoto | null, now: Date) {
    if (this.props.status !== "new") throw new FeedbackError("reviewLocked");
    this.props = { ...this.props, photo, updatedAt: now };
  }

  thank(code: string) {
    if (!this.props.thankYouCode) this.props.thankYouCode = code;
  }

  publish(now: Date) {
    if (!this.isPublishable) throw new FeedbackError("reviewNotPublishable");
    this.props = { ...this.props, status: "published", publishedAt: this.props.publishedAt ?? now, updatedAt: now };
  }

  hide(now: Date) {
    this.props = { ...this.props, status: "hidden", featured: false, updatedAt: now };
  }

  /** В избранное — первыми на главной; только опубликованные. */
  feature(on: boolean, now: Date) {
    if (on && this.props.status !== "published") throw new FeedbackError("reviewNotPublishable");
    this.props = { ...this.props, featured: on, updatedAt: now };
  }
}
