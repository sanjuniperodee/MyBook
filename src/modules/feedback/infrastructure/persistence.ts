import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { orders, reviews, users } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";
import { PUBLIC_TEXT_MIN, ratingSummary, Review, type ReviewRepository, type ReviewStatus } from "../domain";

type Row = typeof reviews.$inferSelect;

const toReview = (r: Row) =>
  Review.restore(r.id, {
    orderId: r.orderId,
    userId: r.userId,
    rating: r.rating,
    text: r.text,
    authorName: r.authorName,
    city: r.city,
    consent: r.consent,
    photo: r.photo ?? null,
    status: r.status,
    featured: r.featured,
    locale: r.locale,
    theme: r.theme,
    thankYouCode: r.thankYouCode,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    publishedAt: r.publishedAt,
  });

export class DrizzleReviewRepository implements ReviewRepository {
  nextId() {
    return randomUUID();
  }

  async byId(id: string) {
    const [r] = await executor().select().from(reviews).where(eq(reviews.id, id)).limit(1);
    return r ? toReview(r) : null;
  }

  async byOrder(orderId: string) {
    const [r] = await executor().select().from(reviews).where(eq(reviews.orderId, orderId)).limit(1);
    return r ? toReview(r) : null;
  }

  async save(review: Review) {
    const { id, photo, ...rest } = review.snapshot();
    const values = { ...rest, photo: photo ?? null };
    await executor()
      .insert(reviews)
      .values({ id, ...values })
      .onConflictDoUpdate({ target: reviews.id, set: values });
  }
}

/** Отзыв на сайте: без контактов и заказа — только то, что автор разрешил показать. */
export interface PublicReview {
  id: string;
  rating: number;
  text: string;
  authorName: string;
  city: string;
  theme: string;
  locale: string;
  photo: { width: number; height: number } | null;
  publishedAt: Date | null;
}

/** Отзыв в CRM. */
export interface StaffReview extends PublicReview {
  status: ReviewStatus;
  featured: boolean;
  consent: boolean;
  orderId: string;
  orderNumber: number;
  userId: string;
  email: string;
  thankYouCode: string | null;
  createdAt: Date;
}

/** Read-модели отзывов: витрина на сайте, сводная оценка, список в CRM, отзыв по заказу. */
export class DrizzleFeedbackQueries {
  /** Витрина на сайте (по теме книги — для её страницы): сначала избранные, затем лучшие и свежие; только с текстом. */
  async showcase(limit = 6, theme?: string): Promise<PublicReview[]> {
    const rows = await executor()
      .select()
      .from(reviews)
      .where(
        and(
          eq(reviews.status, "published"),
          eq(reviews.consent, true),
          gte(sql`char_length(${reviews.text})`, PUBLIC_TEXT_MIN),
          theme ? eq(reviews.theme, theme) : undefined,
        ),
      )
      .orderBy(desc(reviews.featured), desc(reviews.rating), desc(reviews.publishedAt))
      .limit(limit);
    return rows.map(toPublic);
  }

  /** Средняя оценка по всем отзывам (или по теме книги) — и по скрытым тоже: честная цифра важнее красивой. */
  async summary(theme?: string) {
    const rows = await executor()
      .select({ rating: reviews.rating })
      .from(reviews)
      .where(theme ? eq(reviews.theme, theme) : undefined);
    return ratingSummary(rows.map((r) => r.rating));
  }

  async list(filter: ReviewStatus | "all" = "new", limit = 100): Promise<StaffReview[]> {
    const rows = await executor()
      .select({ r: reviews, orderNumber: orders.number, email: users.email })
      .from(reviews)
      .innerJoin(orders, eq(orders.id, reviews.orderId))
      .innerJoin(users, eq(users.id, reviews.userId))
      .where(filter === "all" ? undefined : eq(reviews.status, filter))
      .orderBy(desc(reviews.createdAt))
      .limit(limit);
    return rows.map(({ r, orderNumber, email }) => ({
      ...toPublic(r),
      status: r.status,
      featured: r.featured,
      consent: r.consent,
      orderId: r.orderId,
      orderNumber,
      userId: r.userId,
      email,
      thankYouCode: r.thankYouCode,
      createdAt: r.createdAt,
    }));
  }

  /** Счётчики для меню CRM. */
  async counts() {
    const rows = await executor()
      .select({ status: reviews.status, n: sql<number>`count(*)::int` })
      .from(reviews)
      .groupBy(reviews.status);
    return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Partial<Record<ReviewStatus, number>>;
  }

  /** Отзыв по заказу — для страницы заказа клиента. */
  async byOrder(orderId: string) {
    const [r] = await executor()
      .select({ rating: reviews.rating, status: reviews.status, thankYouCode: reviews.thankYouCode })
      .from(reviews)
      .where(eq(reviews.orderId, orderId))
      .limit(1);
    return r ?? null;
  }

  /** Файл фото: опубликованного — всем, остальных — автору и сотрудникам (проверяет вызывающий). */
  async photo(reviewId: string) {
    const [r] = await executor()
      .select({ photo: reviews.photo, status: reviews.status, userId: reviews.userId })
      .from(reviews)
      .where(and(eq(reviews.id, reviewId), isNotNull(reviews.photo)))
      .limit(1);
    return r?.photo ? { key: r.photo.key, published: r.status === "published", userId: r.userId } : null;
  }
}

function toPublic(r: Row): PublicReview {
  return {
    id: r.id,
    rating: r.rating,
    text: r.text,
    authorName: r.authorName,
    city: r.city,
    theme: r.theme,
    locale: r.locale,
    photo: r.photo ? { width: r.photo.width, height: r.photo.height } : null,
    publishedAt: r.publishedAt,
  };
}
