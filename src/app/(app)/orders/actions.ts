"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import { uuid } from "@/server/input";
import { localCancelOrder, localClaimOrderPayment } from "@/server/v1-local-bridge-orders";
import { v1WebAction } from "@/server/v1-web-client";

/** Клиент сообщает, что оплатил переводом — администратор проверит поступление. */
export async function claimPaymentAction(rawOrderId: string) {
  const user = await requireUser();
  const orderId = uuid.parse(rawOrderId);
  await v1WebAction({
    section: "orders",
    viaApi: (api) => api.cabinetOrderClaim({ orderId }),
    local: () => localClaimOrderPayment(orderId, user.id),
  });
  revalidatePath(`/orders/${orderId}`);
}

export async function cancelOrderAction(rawOrderId: string) {
  const user = await requireUser();
  const orderId = uuid.parse(rawOrderId);
  await v1WebAction({
    section: "orders",
    viaApi: (api) => api.cabinetOrderCancel({ orderId }),
    local: () => localCancelOrder(orderId, user.id),
  });
  revalidatePath(`/orders/${orderId}`);
}
