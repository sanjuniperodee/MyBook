"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import { container } from "@/server/container";

/** Клиент сообщает, что оплатил переводом — администратор проверит поступление. */
export async function claimPaymentAction(orderId: string) {
  const user = await requireUser();
  await container().ordering.orders.claimPayment(orderId, user.id);
  revalidatePath(`/orders/${orderId}`);
}

export async function cancelOrderAction(orderId: string) {
  const user = await requireUser();
  await container().ordering.orders.cancelByCustomer(orderId, user.id);
  revalidatePath(`/orders/${orderId}`);
}
