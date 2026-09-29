"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { giftCards, promoCodes } from "@/lib/db/schema";
import { markGiftPaid, sendGiftToRecipient } from "@/lib/gifts";

export async function markGiftPaidAction(id: string) {
  const admin = await requireAdmin();
  await markGiftPaid(id, `admin:${admin.email}`);
  revalidatePath("/admin/gifts");
}

export async function resendGiftAction(id: string) {
  await requireAdmin();
  const gift = await db.query.giftCards.findFirst({ where: eq(giftCards.id, id), with: { promo: true } });
  if (gift?.status === "paid" && gift.promo && gift.recipientEmail) await sendGiftToRecipient({ ...gift, promo: gift.promo });
  revalidatePath("/admin/gifts");
}

export async function cancelGiftAction(id: string) {
  await requireAdmin();
  const gift = await db.query.giftCards.findFirst({ where: eq(giftCards.id, id) });
  if (!gift) return;
  await db.update(giftCards).set({ status: "cancelled" }).where(eq(giftCards.id, id));
  // Выпущенный код больше не принимается.
  if (gift.promoCodeId) await db.update(promoCodes).set({ active: false }).where(eq(promoCodes.id, gift.promoCodeId));
  revalidatePath("/admin/gifts");
}
