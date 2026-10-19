"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import { container } from "@/server/container";
import { uuid } from "@/server/input";

/** Клиент сообщает, что оплатил переводом — администратор проверит поступление. */
export async function claimPaymentAction(rawOrderId: string) {
  const user = await requireUser();
  const orderId = uuid.parse(rawOrderId);
  await container().ordering.orders.claimPayment(orderId, user.id);
  revalidatePath(`/orders/${orderId}`);
}

export async function cancelOrderAction(rawOrderId: string) {
  const user = await requireUser();
  const orderId = uuid.parse(rawOrderId);
  await container().ordering.orders.cancelByCustomer(orderId, user.id);
  revalidatePath(`/orders/${orderId}`);
}
