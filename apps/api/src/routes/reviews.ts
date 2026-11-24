/**
 * Отзыв к заказу в API v1 — тот же сервис, что у страницы /review/[orderId] (feedback.reviews: правила, промокод,
 * низкая оценка — поддержке). Доступ — владелец заказа (reviewAccess без ссылки из письма), частота — как у сайта.
 */
import type { z } from "zod";
import type { Review as ReviewDto } from "@mybook/contracts";
import { FeedbackError, type Review } from "@/modules/feedback";
import { HttpError } from "@/server/api";
import { container } from "@/server/container";
import { rateLimit, trustedClientIp } from "@/server/rateLimit";
import { reviewAccess } from "@/server/reviews";
import type { Handlers } from "../app";

const toReview = (r: Review): z.output<typeof ReviewDto> => ({
  rating: r.rating,
  text: r.text,
  authorName: r.authorName,
  city: r.city,
  consent: r.consent,
  status: r.status,
  photoUrl: r.photo ? `/api/reviews/photo/${r.id}` : null,
  thankYouCode: r.thankYouCode ?? null,
});

async function ensureAccess(orderId: string) {
  if (!(await reviewAccess(orderId, null))) throw new HttpError(404, "reviewNotFound");
}

async function limited() {
  if (!(await rateLimit(`review:${await trustedClientIp()}`, 20, 3600_000))) throw new HttpError(429, "reviewRate");
}

export const reviewHandlers: Pick<Handlers, "reviewGet" | "reviewSubmit" | "reviewPhotoSet" | "reviewPhotoDelete"> = {
  async reviewGet({ input }) {
    await ensureAccess(input.orderId);
    try {
      const { order, review } = await container().feedback.reviews.open(input.orderId);
      return { canReview: true, defaultName: order.name, review: review ? toReview(review) : null };
    } catch (err) {
      if (!FeedbackError.is(err) || err.code !== "reviewNotAllowed") throw err;
      return { canReview: false, defaultName: "", review: null };
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
