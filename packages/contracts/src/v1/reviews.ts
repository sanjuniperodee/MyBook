/**
 * Отзыв клиента к заказу в API v1: можно ли оставить, свой отзыв, отправка и правка (пока не проверен), фото отдельно.
 * Первый отзыв приносит промокод-благодарность (thankYouCode). Лимиты — как у сайта (сверяет tests/api-v1.test.ts).
 */
import { z } from "zod";
import { route, schemas, uuid, type RouteDef } from "./core";

export const Review = z
  .object({
    rating: z.number().int(),
    text: z.string(),
    authorName: z.string(),
    city: z.string(),
    consent: z.boolean(),
    /** new — ждёт проверки (можно править), published, featured, hidden. */
    status: z.string(),
    /** Путь от сайта (тот же Bearer); null — без фото. */
    photoUrl: z.string().nullable(),
    thankYouCode: z.string().nullable(),
  })
  .register(schemas, { id: "Review" });

export const ReviewView = z
  .object({
    /** Заказ у клиента (доставлен или электронная версия выдана) — отзыв можно оставить. */
    canReview: z.boolean(),
    /** Имя для подписи по умолчанию — из заказа. */
    defaultName: z.string(),
    review: Review.nullable(),
  })
  .register(schemas, { id: "ReviewView" });

export const ReviewBody = z
  .object({
    rating: z.number().int().min(1).max(5),
    text: z.string().max(2000),
    authorName: z.string().trim().min(1, "reviewInvalid").max(40),
    city: z.string().max(40),
    /** Согласие показать отзыв на сайте (с именем и городом). */
    consent: z.boolean(),
  })
  .strict()
  .register(schemas, { id: "ReviewBody" });

const OrderParams = z.object({ orderId: uuid });

export const reviewsRoutes = {
  reviewGet: route({ method: "GET", path: "/api/v1/orders/{orderId}/review", auth: "user", tag: "reviews", summary: "Отзыв к заказу: можно ли оставить и свой отзыв", params: OrderParams, response: ReviewView }),
  reviewSubmit: route({ method: "PUT", path: "/api/v1/orders/{orderId}/review", auth: "user", tag: "reviews", summary: "Оставить или поправить отзыв (фото не трогает)", params: OrderParams, body: ReviewBody, response: Review }),
  reviewPhotoSet: route({ method: "POST", path: "/api/v1/orders/{orderId}/review/photo", auth: "user", tag: "reviews", summary: "Фото к отзыву (multipart, поле photo; до 15 МБ) — после reviewSubmit", params: OrderParams, files: { field: "photo" }, response: Review }),
  reviewPhotoDelete: route({ method: "DELETE", path: "/api/v1/orders/{orderId}/review/photo", auth: "user", tag: "reviews", summary: "Убрать фото из отзыва", params: OrderParams, response: Review }),
} as const satisfies Record<string, RouteDef>;
