/**
 * Отзыв к заказу в API v1 — тот же сервис, что у страницы /review/[orderId] (feedback.reviews: правила, промокод,
 * низкая оценка — поддержке). Доступ — владелец заказа (reviewAccess без ссылки из письма), частота — как у сайта.
 */
import type { z } from "zod";
import { REVIEW_MAX, type Review as ReviewDto } from "@mybook/contracts";
import { getMessages } from "@/i18n/server";
import { bookKind } from "@/lib/content/kinds";
import { THANK_YOU } from "@/modules/feedback/domain/rules";
import { coverImagePath } from "@/server/cover-image";
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

/** Надписи отзыва — как страница /review/<заказ> и карточка в заказе сайта (ReviewForm, ReviewCard). */
async function labelsOf(orderNumber: number, kind: "gift" | "autobiography" | "blank") {
  const t = (await getMessages()).review;
  return {
    order: t.order(orderNumber),
    title: t.title,
    subtitle: t.subtitle,
    ratingAria: t.ratingAria,
    ratings: [...t.ratings],
    textLabel: t.textLabel,
    textHigh: kind === "autobiography" ? t.textHighAutobiography : kind === "blank" ? t.textHighBlank : t.textHigh,
    textLow: t.textLow,
    photo: t.photo,
    photoHint: kind === "gift" ? t.photoHint : t.photoHintOwn,
    photoChoose: t.photoChoose,
    photoRemove: t.photoRemove,
    photoAttached: t.photoAttached,
    name: t.name,
    city: t.city,
    cityPlaceholder: t.cityPlaceholder,
    consent: t.consent,
    submit: t.submit,
    update: t.update,
    editable: t.editable,
    chooseRating: t.chooseRating,
    thanksTitle: t.thanksTitle,
    thanksHigh: t.thanksHigh,
    thanksLow: t.thanksLow,
    promoTitle: t.promoTitle(THANK_YOU.percent),
    promoText: t.promoText(THANK_YOU.validDays),
    copy: t.copy,
    copied: t.copied,
    locked: t.locked,
    notYet: t.notYet,
    card: { title: t.card.title, text: t.card.text(THANK_YOU.percent), button: t.card.button, done: t.card.done, code: t.card.code, edit: t.card.edit },
  };
}

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
    const extra = { coverUrl: coverImagePath(details.book, 480), labels: await labelsOf(details.number, bookKind(details.book.theme)), limits: { ...REVIEW_MAX } };
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
