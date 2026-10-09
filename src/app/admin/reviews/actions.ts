"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertStaff, audit } from "@/server/access";
import { container } from "@/server/container";

const input = z.object({ id: z.string().uuid(), action: z.enum(["publish", "hide", "feature", "unfeature"]) });

/** Проверка отзыва: показать на сайте, скрыть, закрепить первым на главной. */
export async function moderateReviewAction(id: string, action: string) {
  const staff = await assertStaff("reviews.manage");
  const d = input.parse({ id, action });
  await container().feedback.reviews.moderate(d.id, d.action);
  await audit(staff, `review.${d.action}`, "review", d.id);
  revalidatePath("/admin/reviews");
}
