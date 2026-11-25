import "server-only";
import { eq } from "drizzle-orm";
import { reviews } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";
import { deletePrefix } from "@/shared/infrastructure/storage";

/** Отзывы клиента — его текст и фото: при удалении аккаунта уходят целиком (и с сайта, если были опубликованы). */
export const feedbackPrivacy = {
  async forgetUser(userId: string) {
    const rows = await executor().delete(reviews).where(eq(reviews.userId, userId)).returning({ orderId: reviews.orderId });
    for (const r of rows) await deletePrefix(`reviews/${r.orderId}`);
  },
};
