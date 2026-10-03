import "server-only";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import type { Locale } from "@/i18n/config";
import { safeEqual, signValue } from "@/shared/crypto";
import { books, orders, users } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";
import { deleteFile, putFile } from "@/shared/infrastructure/storage";
import { appLink } from "@/shared/infrastructure/mail";
import { FeedbackError } from "../domain";
import type { OrderLookup, PromoCodeGenerator, ReviewPhotoStore } from "../application";

/** Заказ, книга и клиент для отзыва — антикоррупционный слой над таблицами Ordering и Authoring. */
export const drizzleOrderLookup: OrderLookup = {
  async forReview(orderId) {
    const [r] = await executor()
      .select({
        orderId: orders.id,
        number: orders.number,
        userId: orders.userId,
        status: orders.status,
        plan: orders.plan,
        paidAt: orders.paidAt,
        contactName: orders.contactName,
        userName: users.name,
        locale: users.locale,
        theme: books.theme,
        authorName: books.authorName,
      })
      .from(orders)
      .innerJoin(users, eq(users.id, orders.userId))
      .innerJoin(books, eq(books.id, orders.bookId))
      .where(eq(orders.id, orderId))
      .limit(1);
    if (!r) return null;
    return {
      orderId: r.orderId,
      number: r.number,
      userId: r.userId,
      status: r.status,
      plan: r.plan,
      paid: !!r.paidAt,
      locale: r.locale,
      theme: r.theme,
      name: (r.authorName || r.userName || r.contactName).trim().split(/\s+/)[0] ?? "",
    };
  },
};

const PHOTO_SIDE = 1200;

/** Фото к отзыву: поворот по EXIF, без метаданных, не больше 1200 px — карточке отзыва на сайте этого достаточно. */
export const storagePhotos: ReviewPhotoStore = {
  maxBytes: 15 * 1024 * 1024,
  async save(orderId, file) {
    let out: { data: Buffer; info: { width: number; height: number } };
    try {
      out = await sharp(file, { failOn: "error", limitInputPixels: 80_000_000 })
        .rotate()
        .resize({ width: PHOTO_SIDE, height: PHOTO_SIDE, fit: "inside", withoutEnlargement: true })
        .toColourspace("srgb")
        .jpeg({ quality: 80, mozjpeg: true })
        .toBuffer({ resolveWithObject: true });
    } catch {
      throw new FeedbackError("reviewPhotoInvalid");
    }
    const key = `reviews/${orderId}/${randomBytes(6).toString("hex")}.jpg`;
    await putFile(key, out.data);
    return { key, width: out.info.width, height: out.info.height };
  },
  remove: (key) => deleteFile(key),
};

/** SPASIBO-XXXXXX: без похожих символов (0/O, 1/I), чтобы код было легко продиктовать. */
export const thankYouCode: PromoCodeGenerator = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  return `SPASIBO-${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")}`;
};

/**
 * Ссылка на отзыв из письма работает без входа: в ней подпись HMAC от номера заказа.
 * Подделать её без APP_SECRET нельзя, а владельцу заказа в кабинете подпись не нужна.
 */
export function reviewToken(orderId: string) {
  const signed = signValue(`review:${orderId}`);
  return signed.slice(signed.lastIndexOf(".") + 1, signed.lastIndexOf(".") + 33);
}

export function verifyReviewToken(orderId: string, token: string | null | undefined) {
  return !!token && safeEqual(reviewToken(orderId), token);
}

export function reviewUrl(orderId: string, locale: Locale) {
  return appLink(`/review/${orderId}?t=${reviewToken(orderId)}`, locale);
}
