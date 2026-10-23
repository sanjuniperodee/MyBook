"use server";

import { revalidatePath } from "next/cache";
import { uuid } from "@/server/input";
import { assertStaff, audit } from "@/server/access";
import { container } from "@/server/container";

// «Оплачен» — POST /api/admin/gifts/[id]/receipt: с чеком, файл не проходит через server action (лимит тела).

export async function resendGiftAction(id: string) {
  const staff = await assertStaff("gifts.manage");
  const giftId = uuid.parse(id);
  await container().ordering.resendGift(giftId);
  await audit(staff, "gift.resend", "gift", giftId);
  revalidatePath("/admin/gifts");
}

export async function cancelGiftAction(id: string) {
  const staff = await assertStaff("gifts.manage");
  const giftId = uuid.parse(id);
  await container().ordering.gifts.cancel(giftId);
  await audit(staff, "gift.cancel", "gift", giftId);
  revalidatePath("/admin/gifts");
}
