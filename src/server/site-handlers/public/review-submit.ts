import { NextResponse } from "next/server";
import { api, checkOrigin, HttpError } from "@/server/api";
import { trustedClientIp, rateLimit } from "@/server/rateLimit";
import { reviewAccess } from "@/server/reviews";
import { container } from "@/server/container";
import type { PhotoChange } from "@/modules/feedback";
import { idParams } from "@/server/input";
import { REVIEW_SUBMIT_BODY_MAX, reviewSubmitFormSchema } from "@/shared/public-routes";

/** Отзыв к заказу: multipart (поля формы + необязательное фото). Доступ — по ссылке из письма или владельцу. */
export const POST = api(async (req, { params }: { params: Promise<{ orderId: string }> }) => {
  const { orderId } = idParams(await params, "orderId");
  checkOrigin(req);
  if (!(await rateLimit(`review:${await trustedClientIp()}`, 20, 3600_000))) throw new HttpError(429, "reviewRate");
  // Фото до 15 МБ плюс поля формы; больше — отказ до того, как тело прочитано в память.
  if (Number(req.headers.get("content-length") ?? 0) > REVIEW_SUBMIT_BODY_MAX) throw new HttpError(413, "reviewPhotoInvalid");
  const form = await req.formData();
  const token = form.get("t");
  if (!(await reviewAccess(orderId, typeof token === "string" ? token : null))) throw new HttpError(404, "reviewNotFound");

  const field = (k: string) => (typeof form.get(k) === "string" ? (form.get(k) as string) : "");
  const input = reviewSubmitFormSchema.parse({ rating: field("rating"), text: field("text"), authorName: field("authorName"), city: field("city"), consent: field("consent") || "0" });
  const file = form.get("photo");
  const photo: PhotoChange = file instanceof File && file.size > 0 ? { file: Buffer.from(await file.arrayBuffer()) } : field("removePhoto") === "1" ? "remove" : "keep";

  const review = await container().feedback.reviews.submit(orderId, input, photo);
  return NextResponse.json({ status: review.status, thankYouCode: review.thankYouCode, hasPhoto: !!review.photo });
});
