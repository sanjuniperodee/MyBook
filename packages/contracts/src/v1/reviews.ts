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

/** Длины полей отзыва — одни для схемы, сайта и приложения (отдаются в ReviewView.limits). */
export const REVIEW_MAX = { text: 2000, authorName: 40, city: 40 } as const;

/**
 * Надписи отзыва — сообщения review сайта (страница /review/<заказ> и карточка в заказе), посчитанные под эту книгу
 * (вид книги — подсказки текста и фото) и благодарность (процент и срок промокода): у приложения своих строк нет.
 */
export const ReviewLabels = z
  .object({
    order: z.string(),
    title: z.string(),
    subtitle: z.string(),
    ratingAria: z.string(),
    ratings: z.array(z.string()),
    textLabel: z.string(),
    textHigh: z.string(),
    textLow: z.string(),
    photo: z.string(),
    photoHint: z.string(),
    photoChoose: z.string(),
    photoRemove: z.string(),
    photoAttached: z.string(),
    name: z.string(),
    city: z.string(),
    cityPlaceholder: z.string(),
    consent: z.string(),
    submit: z.string(),
    update: z.string(),
    editable: z.string(),
    chooseRating: z.string(),
    thanksTitle: z.string(),
    thanksHigh: z.string(),
    thanksLow: z.string(),
    promoTitle: z.string(),
    promoText: z.string(),
    copy: z.string(),
    copied: z.string(),
    locked: z.string(),
    notYet: z.string(),
    card: z.object({ title: z.string(), text: z.string(), button: z.string(), done: z.string(), code: z.string(), edit: z.string() }),
  })
  .register(schemas, { id: "ReviewLabels" });

export const ReviewView = z
  .object({
    /** Заказ у клиента (доставлен или электронная версия выдана) — отзыв можно оставить. */
    canReview: z.boolean(),
    /** Имя для подписи по умолчанию — из заказа. */
    defaultName: z.string(),
    review: Review.nullable(),
    /** Обложка книги заказа (путь от сайта, ?w=240|480|900 подставляет клиент). */
    coverUrl: z.string(),
    labels: ReviewLabels,
    limits: z.object({ text: z.number().int(), authorName: z.number().int(), city: z.number().int() }),
  })
  .register(schemas, { id: "ReviewView" });

export const ReviewBody = z
  .object({
    rating: z.number().int().min(1).max(5),
    text: z.string().max(REVIEW_MAX.text),
    authorName: z.string().trim().min(1, "reviewInvalid").max(REVIEW_MAX.authorName),
    city: z.string().max(REVIEW_MAX.city),
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
