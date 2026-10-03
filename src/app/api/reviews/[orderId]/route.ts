import { NextResponse } from "next/server";
import { z } from "zod";
import { api, checkOrigin, HttpError } from "@/server/api";
import { clientIp, rateLimit } from "@/server/rateLimit";
import { reviewAccess } from "@/server/reviews";
import { container } from "@/server/container";
import { CITY_MAX, NAME_MAX, RATING_MAX, TEXT_MAX, type PhotoChange } from "@/modules/feedback";

const BODY_MAX = 16 * 1024 * 1024;

const schema = z.object({
  rating: z.coerce.number().int().min(1).max(RATING_MAX),
  text: z.string().max(TEXT_MAX),
  authorName: z.string().trim().min(1, "reviewInvalid").max(NAME_MAX),
  city: z.string().max(CITY_MAX),
  consent: z.enum(["0", "1"]).transform((v) => v === "1"),
});

/** Отзыв к заказу: multipart (поля формы + необязательное фото). Доступ — по ссылке из письма или владельцу. */
export const POST = api(async (req, { params }: { params: Promise<{ orderId: string }> }) => {
  const { orderId } = await params;
  checkOrigin(req);
  if (!(await rateLimit(`review:${await clientIp()}`, 20, 3600_000))) throw new HttpError(429, "reviewRate");
  // Фото до 15 МБ плюс поля формы; больше — отказ до того, как тело прочитано в память.
  if (Number(req.headers.get("content-length") ?? 0) > BODY_MAX) throw new HttpError(413, "reviewPhotoInvalid");
  const form = await req.formData();
  const token = form.get("t");
  if (!(await reviewAccess(orderId, typeof token === "string" ? token : null))) throw new HttpError(404, "reviewNotFound");

  const field = (k: string) => (typeof form.get(k) === "string" ? (form.get(k) as string) : "");
  const input = schema.parse({ rating: field("rating"), text: field("text"), authorName: field("authorName"), city: field("city"), consent: field("consent") || "0" });
  const file = form.get("photo");
  const photo: PhotoChange = file instanceof File && file.size > 0 ? { file: Buffer.from(await file.arrayBuffer()) } : field("removePhoto") === "1" ? "remove" : "keep";

  const review = await container().feedback.reviews.submit(orderId, input, photo);
  return NextResponse.json({ status: review.status, thankYouCode: review.thankYouCode, hasPhoto: !!review.photo });
});
