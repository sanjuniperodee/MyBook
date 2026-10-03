import type { Locale } from "@/i18n/config";
import type { ReviewPhoto } from "../domain";

/** Заказ глазами отзывов (контекст Ordering + книга из Authoring). */
export interface ReviewOrderContext {
  orderId: string;
  number: number;
  userId: string;
  status: string;
  plan: string;
  paid: boolean;
  locale: Locale;
  theme: string;
  /** Имя для подписи по умолчанию: автор книги, иначе из профиля или контактов заказа. */
  name: string;
}

export interface OrderLookup {
  forReview(orderId: string): Promise<ReviewOrderContext | null>;
}

/** Фото к отзыву: проверка, ужатие и хранение. */
export interface ReviewPhotoStore {
  readonly maxBytes: number;
  save(orderId: string, file: Buffer): Promise<ReviewPhoto>;
  remove(key: string): Promise<void>;
}

/** Персональный промокод-благодарность (контекст Ordering). null — код занят, нужен другой. */
export interface ThankYouPromos {
  issue(input: { code: string; percent: number; validHours: number; note: string }): Promise<string | null>;
}

export type PromoCodeGenerator = () => string;

/** Сигнал сотрудникам: низкая оценка — связаться с клиентом. */
export interface StaffAlerts {
  lowRating(input: { reviewId: string; orderNumber: number; rating: number; text: string; authorName: string }): Promise<void>;
}
