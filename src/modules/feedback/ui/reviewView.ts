import type { z } from "zod";
import type { Review as ReviewDto, ReviewView } from "@mybook/contracts";
import type { Messages } from "@/i18n/messages";
import type { BookKind } from "@/lib/content/kinds";
import type { Review } from "../domain";
import { THANK_YOU } from "../domain/rules";

/**
 * Отзыв глазами API v1 — одно отображение для обоих HTTP-процессов (mybook-api и бэкенд на Nest, ADR 0014):
 * DTO отзыва и надписи формы/карточки (как страница /review/<заказ> и карточка в заказе сайта).
 */
export const reviewPhotoPath = (reviewId: string) => `/api/reviews/photo/${reviewId}`;

export const toReviewDto = (r: Review): z.output<typeof ReviewDto> => ({
  rating: r.rating,
  text: r.text,
  authorName: r.authorName,
  city: r.city,
  consent: r.consent,
  status: r.status,
  photoUrl: r.photo ? reviewPhotoPath(r.id) : null,
  thankYouCode: r.thankYouCode ?? null,
});

export type ReviewLabels = z.output<typeof ReviewView>["labels"];

export function reviewLabels(t: Messages["review"], orderNumber: number, kind: BookKind): ReviewLabels {
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
