"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertStaff } from "@/lib/crm/rbac";
import { container } from "@/server/container";

const uuid = z.string().uuid();

export async function markGiftPaidAction(id: string) {
  const staff = await assertStaff("gifts.manage");
  await container().ordering.gifts.confirmPayment(uuid.parse(id), null, { label: `admin:${staff.user.email}`, userId: staff.user.id });
  revalidatePath("/admin/gifts");
}

export async function resendGiftAction(id: string) {
  await assertStaff("gifts.manage");
  await container().ordering.resendGift(uuid.parse(id));
  revalidatePath("/admin/gifts");
}

export async function cancelGiftAction(id: string) {
  await assertStaff("gifts.manage");
  await container().ordering.gifts.cancel(uuid.parse(id));
  revalidatePath("/admin/gifts");
}
