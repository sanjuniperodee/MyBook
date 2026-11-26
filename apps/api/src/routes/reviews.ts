/**
 * Отзыв к заказу в API v1 — тот же сервис, что у страницы /review/[orderId] (feedback.reviews: правила, промокод,
 * низкая оценка — поддержке). Доступ — владелец заказа (reviewAccess без ссылки из письма), частота — как у сайта.
 */
import { REVIEW_MAX } from "@mybook/contracts";
import { getMessages } from "@/i18n/server";
import { bookKind } from "@/lib/content/kinds";
import { FeedbackError } from "@/modules/feedback";
import { reviewLabels, toReviewDto as toReview } from "@/modules/feedback/ui/reviewView";
import { coverImagePath } from "@/lib/book/cover-image-version";
import { HttpError } from "@/server/api";
import { container } from "@/server/container";
import { rateLimit, trustedClientIp } from "@/server/rateLimit";
import { reviewAccess } from "@/server/reviews";
import type { Handlers } from "../app";

async function ensureAccess(orderId: string) {
  if (!(await reviewAccess(orderId, null))) throw new HttpError(404, "reviewNotFound");
}

async function limited() {
  if (!(await rateLimit(`review:${await trustedClientIp()}`, 20, 3600_000))) throw new HttpError(429, "reviewRate");
}

export const reviewHandlers: Pick<Handlers, "reviewGet" | "reviewSubmit" | "reviewPhotoSet" | "reviewPhotoDelete"> = {
  async reviewGet({ input }) {
    await ensureAccess(input.orderId);
    const details = await container().ordering.queries.orderDetails(input.orderId);
    if (!details) throw new HttpError(404, "reviewNotFound");
    const extra = { coverUrl: coverImagePath(details.book, 480), labels: reviewLabels((await getMessages()).review, details.number, bookKind(details.book.theme)), limits: { ...REVIEW_MAX } };
    try {
      const { order, review } = await container().feedback.reviews.open(input.orderId);
      return { canReview: true, defaultName: order.name, review: review ? toReview(review) : null, ...extra };
    } catch (err) {
      if (!FeedbackError.is(err) || err.code !== "reviewNotAllowed") throw err;
      return { canReview: false, defaultName: "", review: null, ...extra };
    }
  },

  async reviewSubmit({ input }) {
    await ensureAccess(input.orderId);
    await limited();
    return toReview(await container().feedback.reviews.submit(input.orderId, input.body, "keep"));
  },

  async reviewPhotoSet({ input }) {
    await ensureAccess(input.orderId);
    await limited();
    const file = input.files[0];
    if (!file) throw new HttpError(400, "badRequest");
    return toReview(await container().feedback.reviews.setPhoto(input.orderId, { file: Buffer.from(await file.arrayBuffer()) }));
  },

  async reviewPhotoDelete({ input }) {
    await ensureAccess(input.orderId);
    return toReview(await container().feedback.reviews.setPhoto(input.orderId, "remove"));
  },
};
